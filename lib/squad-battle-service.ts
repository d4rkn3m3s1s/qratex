/**
 * Klan savaşı + klan yaşam döngüsü servisi (P0-20) — escrow net-sıfır.
 *
 * Önceki durum:
 *  - Admin "İptal" `prisma.squadBattle.delete` yapıyordu: meydan okuyandan tahsil edilen ödül
 *    havuzu (escrow) iade edilmeden yok oluyordu.
 *  - Kurucu klandan ayrılınca `prisma.squad.delete` → açık savaşlar cascade ile siliniyor,
 *    escrow yine kayboluyordu; klan da diğer üyelerin elinden gidiyordu.
 *  - Admin PATCH tamamlanmış savaşı yeniden `active` yapıp `finish` ile havuzu ikinci kez
 *    ödetebiliyordu; `rewardPool` fonlu savaşta keyfi büyütülebiliyordu (mint).
 *  - İade/ödeme `creditPointsAndXp` ile defter dışıydı.
 *
 * Durum makinesi (terminal: completed, cancelled):
 *     pending ──accept──▶ active ──settle──▶ completed
 *        │                  │
 *        └────cancel────────┴────cancel────▶ cancelled   (escrow tam iade)
 *
 * Değişmezler:
 *  - Her geçiş `updateMany({ where: { id, status } })` claim'i ile: eşzamanlı sonlandırıcılardan
 *    (cron + inngest + admin) yalnız biri geçer.
 *  - Ödeme: `paidOutAt IS NULL` guard'ı + kişi başı tek-kez defter anahtarı
 *    `squad-payout:<battleId>:<userId>`; iade: `rewardRefunded` guard'ı + `squad-escrow-refund:<battleId>`.
 *  - Bütün puan hareketleri `mintPoints` (defter + `points_credited`, aynı tx).
 *  - Toplam ödeme + iade = tahsil edilen havuz (gölge banlı kazananın payı da iade edilir).
 *  - Hiçbir yol savaş satırını silmez (soft-cancel: `cancelledAt` + `cancelReason`) ve her
 *    geçiş AuditLog'a yazılır.
 *  - Kurucu ayrılırsa sahiplik en eski üyeye devredilir; klan yalnız son üye ayrıldığında,
 *    açık savaşları iadeli iptal edildikten SONRA kapatılır.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy/mint';

export type SquadDb = Prisma.TransactionClient | typeof prisma;
type Tx = Prisma.TransactionClient;

export const OPEN_BATTLE_STATUSES = ['pending', 'active'] as const;

export type BattleActor = {
  /** İşlemi yapan kullanıcı (admin / klan sahibi). Sistem (cron) için null. */
  actorId: string | null;
  actorRole: 'admin' | 'owner' | 'system';
};

function isRootClient(db: SquadDb): db is typeof prisma {
  return typeof (db as { $transaction?: unknown }).$transaction === 'function';
}

async function inTx<T>(db: SquadDb, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return isRootClient(db) ? db.$transaction(fn) : fn(db);
}

async function writeAudit(
  tx: Tx,
  actor: BattleActor,
  action: string,
  entity: string,
  entityId: string,
  newData: Record<string, unknown>,
  oldData?: Record<string, unknown>
) {
  await tx.auditLog.create({
    data: {
      userId: actor.actorId,
      actorType: actor.actorId ? 'user' : 'system',
      action,
      entity,
      entityId,
      ...(oldData ? { oldData: oldData as Prisma.InputJsonObject } : {}),
      newData: { ...newData, actorRole: actor.actorRole } as Prisma.InputJsonObject,
    },
  });
}

/**
 * Fonlanmış ve henüz iade edilmemiş havuzdan `amount` kadarını meydan okuyana iade eder.
 * `rewardRefunded` false→true claim'i tek sefer garantisi; defter anahtarı ikinci kalkan.
 */
async function refundEscrow(
  tx: Tx,
  battle: { id: string; rewardFunded: boolean; challengedById: string | null },
  amount: number,
  reason: string
): Promise<number> {
  if (!battle.rewardFunded) return 0;
  const claim = await tx.squadBattle.updateMany({
    where: { id: battle.id, rewardFunded: true, rewardRefunded: false },
    data: { rewardRefunded: true },
  });
  if (claim.count === 0 || amount <= 0 || !battle.challengedById) return 0;
  const r = await mintPoints(tx, {
    userId: battle.challengedById,
    points: amount,
    source: 'squad_escrow_refund',
    sourceId: battle.id,
    idempotencyKey: `squad-escrow-refund:${battle.id}`,
    reason,
    capCategory: null, // kullanıcının kendi parası: tavan yok
    fraudGate: false, // net-sıfır: kendi tahsil edilen puanı geri döner
    meta: { battleId: battle.id },
  });
  return r.duplicate ? 0 : r.credited;
}

export type CancelBattleResult =
  | { status: 'cancelled'; previousStatus: string; refunded: number }
  | { status: 'noop'; currentStatus: string | null };

async function cancelInTx(
  tx: Tx,
  battleId: string,
  actor: BattleActor,
  reason: string,
  fromStatuses: readonly string[] = OPEN_BATTLE_STATUSES
): Promise<CancelBattleResult> {
  const before = await tx.squadBattle.findUnique({
    where: { id: battleId },
    select: {
      id: true,
      status: true,
      rewardPool: true,
      rewardFunded: true,
      rewardRefunded: true,
      challengedById: true,
      squad1: { select: { id: true, name: true, ownerId: true } },
      squad2: { select: { id: true, name: true, ownerId: true } },
    },
  });
  if (!before) return { status: 'noop', currentStatus: null };

  const now = new Date();
  const claim = await tx.squadBattle.updateMany({
    where: { id: battleId, status: { in: fromStatuses.filter((st) => (OPEN_BATTLE_STATUSES as readonly string[]).includes(st)) } },
    data: { status: 'cancelled', cancelledAt: now, cancelReason: reason.slice(0, 500) },
  });
  if (claim.count === 0) return { status: 'noop', currentStatus: before.status };

  const refunded = await refundEscrow(tx, before, before.rewardPool, `Klan savaşı iptali: ${reason}`);

  const owners = Array.from(new Set([before.squad1.ownerId, before.squad2.ownerId]));
  await tx.notification.createMany({
    data: owners.map((uid) => ({
      userId: uid,
      title: 'Klan savaşı iptal edildi',
      message:
        `${before.squad1.name} – ${before.squad2.name} savaşı iptal edildi.` +
        (refunded > 0 && uid === before.challengedById
          ? ` Ödül havuzundaki ${refunded.toLocaleString('tr-TR')} puan hesabınıza iade edildi.`
          : ''),
      type: 'warning',
      data: { battleId, kind: 'squad_battle_cancelled' } as Prisma.InputJsonObject,
    })),
  });

  await writeAudit(
    tx,
    actor,
    'SQUAD_BATTLE_CANCEL',
    'SquadBattle',
    battleId,
    { reason, refunded, refundedTo: refunded > 0 ? before.challengedById : null },
    { status: before.status, rewardPool: before.rewardPool, rewardFunded: before.rewardFunded }
  );

  return { status: 'cancelled', previousStatus: before.status, refunded };
}

/** Bekleyen ya da aktif savaşı iadeli iptal eder (silmez). Terminal durumda `noop`. */
export async function cancelSquadBattle(
  db: SquadDb,
  battleId: string,
  opts: BattleActor & {
    reason: string;
    /** Yalnız bu durumlardan iptal et (ör. ret yalnız 'pending'). Varsayılan: pending + active. */
    fromStatuses?: ReadonlyArray<(typeof OPEN_BATTLE_STATUSES)[number]>;
  }
): Promise<CancelBattleResult> {
  const reason = (opts.reason || 'İptal').trim() || 'İptal';
  const actor: BattleActor = { actorId: opts.actorId, actorRole: opts.actorRole };
  return inTx(db, (tx) => cancelInTx(tx, battleId, actor, reason, opts.fromStatuses ?? OPEN_BATTLE_STATUSES));
}

export type SettleBattleResult = {
  battle: Awaited<ReturnType<Tx['squadBattle']['update']>>;
  winnerId: string | null;
  paidOut: number;
  refunded: number;
  perPerson: number;
};

/**
 * Aktif savaşı sonlandırır ve havuzu dağıtır (idempotent). Zaten bitmiş / aktif değilse null.
 * `finishSquadBattle` (lib/gamification-engine.ts) bunu çağırır.
 */
export async function settleSquadBattle(
  battleId: string,
  actor: BattleActor = { actorId: null, actorRole: 'system' },
  db: SquadDb = prisma
): Promise<SettleBattleResult | null> {
  return inTx(db, async (tx) => {
    const now = new Date();
    // Atomik claim + ödeme guard'ı: yalnız hâlâ aktif ve ÖDENMEMİŞ savaş.
    const claimed = await tx.squadBattle.updateMany({
      where: { id: battleId, status: 'active', paidOutAt: null },
      data: { status: 'completed', paidOutAt: now },
    });
    if (claimed.count === 0) return null;

    const battle = await tx.squadBattle.findUnique({
      where: { id: battleId },
      include: {
        participants: true,
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
    });
    if (!battle) throw new Error('Savaş bulunamadı');

    let winnerId: string | null = null;
    if (battle.squad1Score > battle.squad2Score) winnerId = battle.squad1Id;
    else if (battle.squad2Score > battle.squad1Score) winnerId = battle.squad2Id;

    // Yalnız escrow ile FONLANMIŞ havuz dağıtılır; fonlanmamış (admin/onur) savaş puan basmaz.
    const pool = battle.rewardFunded && !battle.rewardRefunded ? battle.rewardPool : 0;
    let paidOut = 0;
    let perPerson = 0;

    if (winnerId && pool > 0) {
      // Katılımcı satırları tekil (@@unique battleId+userId); yine de tekilleştir.
      const winners = Array.from(
        new Set(battle.participants.filter((p) => p.squadId === winnerId).map((p) => p.userId))
      ).sort();
      if (winners.length > 0) {
        perPerson = Math.floor(pool / winners.length);
        const xpPerPerson = Math.floor(perPerson * 0.5);
        for (const userId of winners) {
          if (perPerson <= 0) break;
          const r = await mintPoints(tx, {
            userId,
            points: perPerson,
            xp: xpPerPerson,
            source: 'squad_battle',
            sourceId: battle.id,
            idempotencyKey: `squad-payout:${battle.id}:${userId}`,
            capCategory: null, // escrow'dan ödeme: yeni değer basılmıyor
            meta: { battleId: battle.id },
          });
          // Gölge banlı kazananın payı (void) dağıtılmış sayılmaz → meydan okuyana iade.
          // Daha önce ödenmiş pay (duplicate) dağıtılmış sayılır: iade fazladan puan basmasın.
          if (r.status === 'posted') paidOut += r.credited;
          if (r.status === 'posted' && !r.duplicate) {
            await tx.notification.create({
              data: {
                userId,
                title: 'Savaş Galibiyeti! ⚔️',
                message: `${battle.squad1.name} – ${battle.squad2.name} savaşını kazandınız! ${perPerson.toLocaleString('tr-TR')} puan ve ${xpPerPerson.toLocaleString('tr-TR')} XP kazandınız.`,
                type: 'success',
              },
            });
          }
        }
      }
      if (paidOut > 0) {
        await tx.squad.update({ where: { id: winnerId }, data: { totalPoints: { increment: paidOut } } });
      }
    }

    // Dağıtılmayan kalan (kazanan yok, bölme artığı, katılımcısız, gölge ban) → iade.
    const refunded = await refundEscrow(
      tx,
      battle,
      battle.rewardFunded && !battle.rewardRefunded ? battle.rewardPool - paidOut : 0,
      'Klan savaşı: dağıtılmayan ödül havuzu iadesi'
    );

    const updated = await tx.squadBattle.update({ where: { id: battleId }, data: { winnerId } });

    await writeAudit(tx, actor, 'SQUAD_BATTLE_SETTLE', 'SquadBattle', battleId, {
      winnerId,
      pool,
      paidOut,
      perPerson,
      refunded,
      squad1Score: battle.squad1Score,
      squad2Score: battle.squad2Score,
    });

    return { battle: updated, winnerId, paidOut, refunded, perPerson };
  });
}

export type LeaveSquadResult =
  | { kind: 'not_member' }
  | { kind: 'left' }
  | { kind: 'ownership_transferred'; newOwnerId: string }
  | { kind: 'dissolved'; cancelledBattles: number; refunded: number };

/**
 * Üyenin klandan ayrılması. Kurucu ayrılırsa sahiplik, başka klanın sahibi olmayan en eski
 * üyeye devredilir; aday yoksa (son üye) klan açık savaşları iadeli iptal edilip kapatılır.
 * Klan satırı kilitlenir: eşzamanlı iki ayrılış aynı devri iki kez yapamaz.
 */
export async function leaveSquad(
  params: { squadId: string; userId: string },
  db: SquadDb = prisma
): Promise<LeaveSquadResult> {
  return inTx(db, async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Squad" WHERE "id" = ${params.squadId} FOR UPDATE`;

    const membership = await tx.squadMember.findFirst({
      where: { userId: params.userId, squadId: params.squadId },
      select: { id: true, squad: { select: { id: true, name: true, ownerId: true } } },
    });
    if (!membership) return { kind: 'not_member' };
    const squad = membership.squad;

    // Aktif savaş kadrosundan çık (payından vazgeç): skoru klan toplamında kalır ama ödeme
    // yalnız kadroya → ayrılıp rakibe geçen eski klanından pay alamaz (customer_squads Bulgu 6).
    await tx.squadBattleParticipant.deleteMany({
      where: { userId: params.userId, squadId: squad.id, battle: { status: 'active' } },
    });

    if (squad.ownerId !== params.userId) {
      await tx.squadMember.delete({ where: { id: membership.id } });
      await writeAudit(tx, { actorId: params.userId, actorRole: 'owner' }, 'SQUAD_MEMBER_LEAVE', 'Squad', squad.id, {
        userId: params.userId,
      });
      return { kind: 'left' };
    }

    const others = await tx.squadMember.findMany({
      where: { squadId: squad.id, userId: { not: params.userId } },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: { userId: true },
    });
    let newOwnerId: string | null = null;
    if (others.length > 0) {
      const ownersElsewhere = await tx.squad.findMany({
        where: { ownerId: { in: others.map((o) => o.userId) } },
        select: { ownerId: true },
      });
      const blocked = new Set(ownersElsewhere.map((s) => s.ownerId));
      newOwnerId = others.find((o) => !blocked.has(o.userId))?.userId ?? null;
    }

    const actor: BattleActor = { actorId: params.userId, actorRole: 'owner' };

    if (newOwnerId) {
      await tx.squad.update({ where: { id: squad.id }, data: { ownerId: newOwnerId } });
      await tx.squadMember.delete({ where: { id: membership.id } });
      await tx.notification.create({
        data: {
          userId: newOwnerId,
          title: 'Klanın yeni lideri sizsiniz 👑',
          message: `${squad.name} klanının kurucusu ayrıldı; klan yönetimi size devredildi.`,
          type: 'info',
          data: { squadId: squad.id, kind: 'squad_ownership_transferred' } as Prisma.InputJsonObject,
        },
      });
      await writeAudit(tx, actor, 'SQUAD_OWNERSHIP_TRANSFER', 'Squad', squad.id, {
        fromUserId: params.userId,
        toUserId: newOwnerId,
      });
      await writeAudit(tx, actor, 'SQUAD_MEMBER_LEAVE', 'Squad', squad.id, { userId: params.userId });
      return { kind: 'ownership_transferred', newOwnerId };
    }

    if (others.length > 0) {
      // Devredilecek uygun üye yok (hepsi başka klanın sahibi — tutarsız veri): veri kaybı
      // riskine girmeden reddet.
      throw new SquadLifecycleError(
        'Klan sahipliği devredilemedi: uygun üye yok. Lütfen destek ile iletişime geçin.'
      );
    }

    // Son üye: önce açık savaşları iadeli iptal et, sonra klanı kapat.
    const open = await tx.squadBattle.findMany({
      where: {
        status: { in: [...OPEN_BATTLE_STATUSES] },
        OR: [{ squad1Id: squad.id }, { squad2Id: squad.id }],
      },
      select: { id: true },
    });
    let refunded = 0;
    let cancelledBattles = 0;
    for (const b of open) {
      const r = await cancelInTx(tx, b.id, actor, 'Klan dağıldı (son üye ayrıldı)');
      if (r.status === 'cancelled') {
        cancelledBattles += 1;
        refunded += r.refunded;
      }
    }
    await writeAudit(tx, actor, 'SQUAD_DISSOLVE', 'Squad', squad.id, {
      name: squad.name,
      cancelledBattles,
      refunded,
    });
    await tx.squad.delete({ where: { id: squad.id } });
    return { kind: 'dissolved', cancelledBattles, refunded };
  });
}

export class SquadLifecycleError extends Error {}
