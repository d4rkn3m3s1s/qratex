/**
 * Klan Merkezi — yazma tarafı (sunucu otoriter, her aksiyon tek transaction + AuditLog).
 *
 * Kapanan bulgular:
 *  - admin_squads B1/B5: dondurma artık GERÇEKTEN uygulanır (tek kaynak `Squad.isFrozen`; katılma,
 *    meydan okuma, kabul, hedef ödülü ve klan gücü payı bu kolonu okur) ve dondurulan klanın açık
 *    savaşları iadeli iptal edilir. Gerekçe zorunlu, denetime yazılır, lider bilgilendirilir.
 *  - admin_squads eksik #2: yeniden adlandırma, slogan kaldırma, davet kodu yenileme, üye çıkarma,
 *    liderlik devri. Klan SİLME yok (cascade silme yasak; dondurma = arşiv).
 *  - admin_squads_battles B1/B3/B4/B8/B12: oluşturma sunucu doğrulamalı (tek açık savaş, dondurma,
 *    süre), geçişler adlandırılmış (finish/cancel/extend/adjust_score), iptal iadeli, hepsi denetimli.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import {
  cancelSquadBattle,
  settleSquadBattle,
  OPEN_BATTLE_STATUSES,
  type BattleActor,
} from '@/lib/squad-battle-service';
import { forfeitActiveBattleShare } from '@/lib/squads/membership';
import { generateInviteCode } from '@/lib/squads/rules';
import type {
  BattleActionInput,
  BattleActionResult,
  BattleCreateInput,
  SquadActionInput,
  SquadActionResult,
} from './contract';

type Tx = Prisma.TransactionClient;

export type AdminActor = { userId: string; ipAddress: string | null; userAgent: string | null };

const SQUADS_HREF = '/customer/squads';
const MAX_EXTEND_MS = 168 * 3600_000;

async function lockSquad(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Squad" WHERE "id" = ${id} FOR UPDATE`;
  const s = await tx.squad.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, ownerId: true, isFrozen: true, inviteCode: true },
  });
  if (!s) throw new ApiError('NOT_FOUND', 'Klan bulunamadı.');
  return s;
}

async function audit(
  tx: Tx,
  actor: AdminActor,
  action: string,
  entity: 'Squad' | 'SquadBattle',
  entityId: string,
  newData: Record<string, unknown>,
  oldData?: Record<string, unknown>
) {
  await tx.auditLog.create({
    data: {
      userId: actor.userId,
      actorType: 'user',
      action,
      entity,
      entityId,
      ...(oldData ? { oldData: oldData as Prisma.InputJsonObject } : {}),
      newData: { ...newData, actorRole: 'admin' } as Prisma.InputJsonObject,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    },
  });
}

function notify(tx: Tx, userIds: string[], title: string, message: string, type: string, data: Record<string, unknown>) {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return Promise.resolve();
  return tx.notification.createMany({
    data: ids.map((userId) => ({ userId, title, message, type, data: { ...data, href: SQUADS_HREF } as Prisma.InputJsonObject })),
  });
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}

// ───────────────────────────── Klan aksiyonları ─────────────────────────────

export async function applySquadAction(squadId: string, input: SquadActionInput, actor: AdminActor): Promise<SquadActionResult> {
  if (input.action === 'regenerate_invite') {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const s = await lockSquad(tx, squadId);
          const inviteCode = generateInviteCode();
          await tx.squad.update({ where: { id: squadId }, data: { inviteCode } });
          await audit(tx, actor, 'SQUAD_INVITE_ROTATE', 'Squad', squadId, { reason: input.reason }, { inviteCode: s.inviteCode });
          await notify(tx, [s.ownerId], 'Davet kodu yenilendi', `${s.name} klanının davet kodu yönetici tarafından yenilendi. Eski kod artık çalışmaz.`, 'info', {
            kind: 'squad_invite_rotated',
            squadId,
          });
          return { action: input.action, changed: true, inviteCode };
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new ApiError('CONFLICT', 'Yeni davet kodu üretilemedi. Lütfen tekrar deneyin.', { retryable: true });
  }

  return prisma.$transaction(async (tx): Promise<SquadActionResult> => {
    const s = await lockSquad(tx, squadId);

    switch (input.action) {
      case 'freeze': {
        if (s.isFrozen) return { action: 'freeze', changed: false };
        await tx.squad.update({ where: { id: squadId }, data: { isFrozen: true } });
        const open = await tx.squadBattle.findMany({
          where: { status: { in: [...OPEN_BATTLE_STATUSES] }, OR: [{ squad1Id: squadId }, { squad2Id: squadId }] },
          select: { id: true },
        });
        const battleActor: BattleActor = { actorId: actor.userId, actorRole: 'admin' };
        let cancelledBattles = 0;
        let refunded = 0;
        for (const b of open) {
          const r = await cancelSquadBattle(tx, b.id, { ...battleActor, reason: `Klan donduruldu: ${input.reason}` });
          if (r.status === 'cancelled') {
            cancelledBattles++;
            refunded += r.refunded;
          }
        }
        await audit(tx, actor, 'SQUAD_FREEZE', 'Squad', squadId, { reason: input.reason, cancelledBattles, refunded }, { isFrozen: false });
        await notify(
          tx,
          [s.ownerId],
          'Klanın askıya alındı',
          `${s.name} klanı yönetici tarafından askıya alındı. Askı süresince yeni üye alınamaz, savaş başlatılamaz ve klan gücü birikmez. Gerekçe: ${input.reason}`,
          'warning',
          { kind: 'squad_frozen', squadId }
        );
        return { action: 'freeze', changed: true, cancelledBattles, refunded };
      }
      case 'unfreeze': {
        if (!s.isFrozen) return { action: 'unfreeze', changed: false };
        await tx.squad.update({ where: { id: squadId }, data: { isFrozen: false } });
        await audit(tx, actor, 'SQUAD_UNFREEZE', 'Squad', squadId, { reason: input.reason }, { isFrozen: true });
        await notify(tx, [s.ownerId], 'Klanın yeniden etkin', `${s.name} klanının askısı kaldırıldı. Üye alabilir ve savaşlara katılabilirsiniz.`, 'success', {
          kind: 'squad_unfrozen',
          squadId,
        });
        return { action: 'unfreeze', changed: true };
      }
      case 'rename': {
        if (input.name === s.name) return { action: 'rename', changed: false, name: s.name };
        const clash = await tx.squad.findFirst({
          where: { name: { equals: input.name, mode: 'insensitive' }, id: { not: squadId } },
          select: { id: true },
        });
        if (clash) throw new ApiError('CONFLICT', 'Bu ad başka bir klanda kullanılıyor.', { details: [{ path: 'name', message: 'Bu ad başka bir klanda kullanılıyor.' }] });
        await tx.squad.update({ where: { id: squadId }, data: { name: input.name } });
        await audit(tx, actor, 'SQUAD_RENAME', 'Squad', squadId, { name: input.name, reason: input.reason }, { name: s.name });
        await notify(tx, [s.ownerId], 'Klan adı değiştirildi', `Klanının adı yönetici tarafından "${input.name}" olarak değiştirildi. Gerekçe: ${input.reason}`, 'warning', {
          kind: 'squad_renamed',
          squadId,
        });
        return { action: 'rename', changed: true, name: input.name };
      }
      case 'clear_description': {
        if (!s.description) return { action: 'clear_description', changed: false };
        await tx.squad.update({ where: { id: squadId }, data: { description: null } });
        await audit(tx, actor, 'SQUAD_DESCRIPTION_CLEAR', 'Squad', squadId, { reason: input.reason }, { description: s.description });
        await notify(tx, [s.ownerId], 'Klan sloganı kaldırıldı', `${s.name} klanının sloganı yönetici tarafından kaldırıldı. Gerekçe: ${input.reason}`, 'warning', {
          kind: 'squad_description_cleared',
          squadId,
        });
        return { action: 'clear_description', changed: true };
      }
      case 'remove_member': {
        if (input.userId === s.ownerId) {
          throw new ApiError('BAD_REQUEST', 'Lider klandan çıkarılamaz. Önce liderliği başka bir üyeye devredin.');
        }
        const member = await tx.squadMember.findFirst({ where: { squadId, userId: input.userId }, select: { id: true } });
        if (!member) throw new ApiError('NOT_FOUND', 'Seçilen kişi bu klanın üyesi değil.');
        // Aktif savaş kadrosundan da çıkar: payı (ödeme) kalmaz; kazanılmış skor klan toplamında kalır.
        const forfeited = await forfeitActiveBattleShare(tx, squadId, input.userId);
        await tx.squadMember.delete({ where: { id: member.id } });
        await audit(tx, actor, 'SQUAD_MEMBER_REMOVE', 'Squad', squadId, { userId: input.userId, reason: input.reason, forfeitedBattleShares: forfeited });
        await notify(
          tx,
          [input.userId],
          'Klandan çıkarıldın',
          `${s.name} klanından yönetici tarafından çıkarıldın. Yeni bir klan kurabilir ya da başka bir klana katılabilirsin.`,
          'warning',
          { kind: 'squad_member_removed', squadId }
        );
        return { action: 'remove_member', changed: true };
      }
      case 'transfer_owner': {
        if (input.userId === s.ownerId) return { action: 'transfer_owner', changed: false };
        const member = await tx.squadMember.findFirst({ where: { squadId, userId: input.userId }, select: { id: true } });
        if (!member) throw new ApiError('NOT_FOUND', 'Seçilen kişi bu klanın üyesi değil.');
        const ownsOther = await tx.squad.findFirst({ where: { ownerId: input.userId, id: { not: squadId } }, select: { id: true } });
        if (ownsOther) throw new ApiError('CONFLICT', 'Seçilen üye başka bir klanın lideri; liderlik ona devredilemez.');
        await tx.squad.update({ where: { id: squadId }, data: { ownerId: input.userId } });
        await audit(tx, actor, 'SQUAD_OWNERSHIP_TRANSFER', 'Squad', squadId, { fromUserId: s.ownerId, toUserId: input.userId, reason: input.reason });
        await notify(tx, [input.userId], 'Klanın yeni lideri sensin', `${s.name} klanının liderliği yönetici tarafından sana devredildi.`, 'info', {
          kind: 'squad_ownership_transferred',
          squadId,
        });
        await notify(tx, [s.ownerId], 'Klan liderliği devredildi', `${s.name} klanının liderliği yönetici tarafından başka bir üyeye devredildi. Gerekçe: ${input.reason}`, 'warning', {
          kind: 'squad_ownership_transferred',
          squadId,
        });
        return { action: 'transfer_owner', changed: true };
      }
    }
  });
}

// ───────────────────────────── Savaş oluşturma ─────────────────────────────

export async function createAdminBattle(input: BattleCreateInput, actor: AdminActor, now: Date = new Date()): Promise<{ id: string; status: 'pending' | 'active' }> {
  const ids = [input.squad1Id, input.squad2Id];
  return prisma.$transaction(async (tx) => {
    // Kilit sırası kimliğe göre (meydan okuma akışıyla aynı) → kilitlenme yok.
    for (const id of [...ids].sort()) await tx.$queryRaw`SELECT "id" FROM "Squad" WHERE "id" = ${id} FOR UPDATE`;
    const squads = await tx.squad.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, ownerId: true, isFrozen: true } });
    if (squads.length !== 2) throw new ApiError('NOT_FOUND', 'Klanlardan biri bulunamadı.');
    const frozen = squads.find((s) => s.isFrozen);
    if (frozen) throw new ApiError('CONFLICT', `${frozen.name} klanı dondurulmuş; savaşa sokulamaz.`, { details: [{ path: frozen.id === input.squad1Id ? 'squad1Id' : 'squad2Id', message: 'Dondurulmuş klan' }] });
    if (squads[0].ownerId === squads[1].ownerId) throw new ApiError('BAD_REQUEST', 'İki klanın lideri aynı kişi; bu savaş kurulamaz.');

    const existing = await tx.squadBattle.findFirst({
      where: {
        status: { in: [...OPEN_BATTLE_STATUSES] },
        endTime: { gt: now },
        OR: [{ squad1Id: { in: ids } }, { squad2Id: { in: ids } }],
      },
      select: { id: true, squad1Id: true, squad2Id: true },
    });
    if (existing) {
      const busy = squads.find((s) => s.id === existing.squad1Id || s.id === existing.squad2Id);
      throw new ApiError('CONFLICT', `${busy?.name ?? 'Klanlardan biri'} zaten açık bir savaşta ya da bekleyen davette.`);
    }

    const s1 = squads.find((s) => s.id === input.squad1Id)!;
    const s2 = squads.find((s) => s.id === input.squad2Id)!;
    const endTime = new Date(now.getTime() + input.durationHours * 3600_000);
    const startNow = input.mode === 'start_now';
    const created = await tx.squadBattle.create({
      data: {
        squad1Id: s1.id,
        squad2Id: s2.id,
        status: startNow ? 'active' : 'pending',
        startTime: now,
        endTime,
        acceptedAt: startNow ? now : null,
        rewardPool: 0,
        rewardFunded: false,
        challengedById: null,
      },
      select: { id: true },
    });

    let recipients: string[] = [s2.ownerId];
    if (startNow) {
      const members = await tx.squadMember.findMany({ where: { squadId: { in: ids } }, select: { userId: true, squadId: true } });
      if (members.length > 0) {
        await tx.squadBattleParticipant.createMany({
          data: members.map((m) => ({ battleId: created.id, squadId: m.squadId, userId: m.userId })),
          skipDuplicates: true,
        });
      }
      recipients = members.map((m) => m.userId);
      await notify(
        tx,
        recipients,
        'Klan savaşı başladı',
        `Qratex ekibinin düzenlediği ${s1.name} – ${s2.name} onur savaşı başladı (${input.durationHours} saat). Ödül havuzu yok; zafer klanın sicilinde kalır.`,
        'success',
        { battleId: created.id, kind: 'squad_battle_started' }
      );
    } else {
      await notify(
        tx,
        [s2.ownerId],
        'Klan savaşı daveti',
        `Qratex ekibi ${s2.name} klanını ${s1.name} klanıyla ${input.durationHours} saatlik bir onur savaşına davet etti (ödül havuzu yok). Klan sayfandan kabul ya da ret edebilirsin.`,
        'info',
        { battleId: created.id, kind: 'squad_battle_challenge' }
      );
      await notify(tx, [s1.ownerId], 'Klan savaşı planlandı', `Qratex ekibi klanını ${s2.name} klanıyla onur savaşına eşleştirdi. Rakip lider kabul edince savaş başlar.`, 'info', {
        battleId: created.id,
        kind: 'squad_battle_planned',
      });
    }

    await audit(tx, actor, 'SQUAD_BATTLE_CREATE', 'SquadBattle', created.id, {
      squad1Id: s1.id,
      squad2Id: s2.id,
      durationHours: input.durationHours,
      mode: input.mode,
      endTime: endTime.toISOString(),
      origin: 'admin',
    });
    return { id: created.id, status: startNow ? 'active' : 'pending' };
  });
}

// ───────────────────────────── Savaş geçişleri ─────────────────────────────

export async function applyBattleAction(battleId: string, input: BattleActionInput, actor: AdminActor, now: Date = new Date()): Promise<BattleActionResult> {
  const battleActor: BattleActor = { actorId: actor.userId, actorRole: 'admin' };

  if (input.action === 'finish') {
    const settled = await settleSquadBattle(battleId, battleActor);
    if (!settled) throw new ApiError('CONFLICT', 'Savaş aktif değil ya da zaten sonuçlandırılmış.');
    return { action: 'finish', winnerId: settled.winnerId, paidOut: settled.paidOut, perPerson: settled.perPerson, refunded: settled.refunded };
  }

  if (input.action === 'cancel') {
    const r = await cancelSquadBattle(prisma, battleId, { ...battleActor, reason: input.reason });
    if (r.status === 'noop') {
      throw r.currentStatus ? new ApiError('CONFLICT', 'Bu savaş zaten sonuçlanmış ya da iptal edilmiş.') : new ApiError('NOT_FOUND', 'Savaş bulunamadı.');
    }
    return { action: 'cancel', refunded: r.refunded };
  }

  if (input.action === 'extend') {
    const endTime = new Date(input.endTime);
    if (endTime.getTime() <= now.getTime() || endTime.getTime() - now.getTime() > MAX_EXTEND_MS) {
      throw new ApiError('VALIDATION', 'Yeni bitiş gelecekte ve en fazla 7 gün sonra olmalı.', { details: [{ path: 'endTime', message: 'Geçersiz bitiş' }] });
    }
    return prisma.$transaction(async (tx) => {
      const before = await tx.squadBattle.findUnique({ where: { id: battleId }, select: { endTime: true, status: true } });
      if (!before) throw new ApiError('NOT_FOUND', 'Savaş bulunamadı.');
      const r = await tx.squadBattle.updateMany({
        where: { id: battleId, status: { in: [...OPEN_BATTLE_STATUSES] }, endTime: { lt: endTime } },
        data: { endTime },
      });
      if (r.count === 0) throw new ApiError('CONFLICT', 'Yalnız açık bir savaşın bitişi ileri alınabilir (yeni bitiş mevcut bitişten sonra olmalı).');
      await audit(tx, actor, 'SQUAD_BATTLE_EXTEND', 'SquadBattle', battleId, { endTime: endTime.toISOString(), reason: input.reason }, { endTime: before.endTime.toISOString(), status: before.status });
      return { action: 'extend' as const, endTime: endTime.toISOString() };
    });
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.squadBattle.findUnique({ where: { id: battleId }, select: { squad1Score: true, squad2Score: true } });
    if (!before) throw new ApiError('NOT_FOUND', 'Savaş bulunamadı.');
    const r = await tx.squadBattle.updateMany({
      where: { id: battleId, status: 'active' },
      data: { squad1Score: input.squad1Score, squad2Score: input.squad2Score },
    });
    if (r.count === 0) throw new ApiError('CONFLICT', 'Skor yalnız aktif savaşta düzeltilebilir.');
    await audit(
      tx,
      actor,
      'SQUAD_BATTLE_ADJUST_SCORE',
      'SquadBattle',
      battleId,
      { squad1Score: input.squad1Score, squad2Score: input.squad2Score, reason: input.reason },
      { squad1Score: before.squad1Score, squad2Score: before.squad2Score }
    );
    return { action: 'adjust_score' as const, squad1Score: input.squad1Score, squad2Score: input.squad2Score };
  });
}
