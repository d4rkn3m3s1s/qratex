/**
 * Klan üyeliği ve yönetimi — sunucu otoriter, her yazma tek transaction + satır kilidi.
 *
 * Denetimde kapanan açıklar (docs/audit/2026-10-08/musteri/customer_squads.md):
 *  - Bulgu 5: üye sınırı yoktu ve üyelik kontrolü transaction dışındaydı (iki eşzamanlı
 *    katılım iki klana sokabiliyordu). Artık kullanıcının satırı (`User FOR UPDATE`) ve klan
 *    satırı (`Squad FOR UPDATE`) kilitlenip kontrol + yazma aynı transaction'da yapılır.
 *    Aynı kullanıcı için join/create istekleri sıraya girer; kapasite yarışı da kapanır.
 *  - Bulgu 3: dondurma tek kaynaktan (`Squad.isFrozen`); ölü `admin_frozen_squads` okuması yok.
 *  - Bulgu 9: aynı ad → 500 yerine 409 `SQUAD_NAME_TAKEN` (büyük/küçük harf duyarsız ön kontrol
 *    + P2002 eşlemesi); bütün hatalar kodlu ve Türkçe.
 *  - Envanter 31: liderlik devri, üye çıkarma, davet kodu yenileme, ad/slogan, hedef kademesi.
 *  - Bulgu 6: aktif savaştayken üye çıkarma kilitli (lider son anda kadroyu küçültüp payı
 *    şişiremez); kendi isteğiyle ayrılan üye savaş payından vazgeçer (`forfeitActiveBattleShare`).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { lockUserForUpdate } from '@/lib/economy/mint';
import {
  SQUAD_MAX_MEMBERS,
  generateInviteCode,
  resolveGoalTier,
  type WeeklyGoalTier,
} from './rules';
import { squadError, uniqueViolationTarget } from './errors';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

const SQUADS_HREF = '/customer/squads';

/** Kullanıcının üyeliği (kararlı sıra: en eski). */
export async function membershipOf(db: Db, userId: string) {
  return db.squadMember.findFirst({
    where: { userId },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, squadId: true, joinedAt: true },
  });
}

async function lockSquad(tx: Tx, squadId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Squad" WHERE "id" = ${squadId} FOR UPDATE`;
  return Array.isArray(rows) && rows.length > 0;
}

export async function writeSquadAudit(
  tx: Tx,
  actorId: string | null,
  action: string,
  squadId: string,
  newData: Record<string, unknown>,
  oldData?: Record<string, unknown>
) {
  await tx.auditLog.create({
    data: {
      userId: actorId,
      actorType: actorId ? 'user' : 'system',
      action,
      entity: 'Squad',
      entityId: squadId,
      ...(oldData ? { oldData: oldData as Prisma.InputJsonObject } : {}),
      newData: newData as Prisma.InputJsonObject,
    },
  });
}

async function displayName(tx: Tx, userId: string): Promise<string> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
  return (u?.name ?? '').trim() || 'Bir üye';
}

/** Aktif (süresi dolmamış) savaşta mı? */
export async function hasActiveBattle(db: Db, squadId: string, now = new Date()): Promise<boolean> {
  const b = await db.squadBattle.findFirst({
    where: { status: 'active', endTime: { gt: now }, OR: [{ squad1Id: squadId }, { squad2Id: squadId }] },
    select: { id: true },
  });
  return !!b;
}

/**
 * Üye aktif savaşın kadrosundan çıkar (payından vazgeçer). Skoru klan toplamında kalır
 * (zaten kazanıldı) ama ödeme yalnız kadroya yapılır → ayrılıp karşı tarafa geçen biri eski
 * klanından pay alamaz (Bulgu 6, yeniden üretim a).
 */
export async function forfeitActiveBattleShare(tx: Tx, squadId: string, userId: string): Promise<number> {
  const r = await tx.squadBattleParticipant.deleteMany({
    where: { userId, squadId, battle: { status: 'active' } },
  });
  return r.count;
}

// ───────────────────────────── Oluştur ─────────────────────────────

export async function createSquad(
  userId: string,
  input: { name: string; description?: string | null }
): Promise<{ id: string; name: string; inviteCode: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockUserForUpdate(tx, userId);
        const membership = await membershipOf(tx, userId);
        if (membership) throw squadError('ALREADY_IN_SQUAD');
        const owned = await tx.squad.findFirst({ where: { ownerId: userId }, select: { id: true } });
        if (owned) throw squadError('ALREADY_IN_SQUAD');

        const clash = await tx.squad.findFirst({
          where: { name: { equals: input.name, mode: 'insensitive' } },
          select: { id: true },
        });
        if (clash) throw squadError('SQUAD_NAME_TAKEN');

        const squad = await tx.squad.create({
          data: {
            name: input.name,
            description: input.description ? input.description : null,
            ownerId: userId,
            inviteCode: generateInviteCode(),
            weeklyTeamTarget: 2,
            members: { create: { userId } },
          },
          select: { id: true, name: true, inviteCode: true },
        });
        await writeSquadAudit(tx, userId, 'SQUAD_CREATE', squad.id, { name: squad.name });
        return squad;
      });
    } catch (err) {
      const target = uniqueViolationTarget(err);
      if (target === null) throw err;
      if (target.includes('name')) throw squadError('SQUAD_NAME_TAKEN');
      if (target.includes('ownerId') || target.includes('userId')) throw squadError('ALREADY_IN_SQUAD');
      // inviteCode çakışması: yeni kodla tekrar dene.
    }
  }
  throw new ApiError('CONFLICT', 'Davet kodu üretilemedi. Lütfen tekrar deneyin.', { retryable: true });
}

/** Ad müsait mi (büyük/küçük harf duyarsız). `exceptSquadId` → yeniden adlandırmada kendi adı. */
export async function isSquadNameAvailable(name: string, exceptSquadId?: string): Promise<boolean> {
  const clash = await prisma.squad.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptSquadId ? { id: { not: exceptSquadId } } : {}),
    },
    select: { id: true },
  });
  return !clash;
}

// ───────────────────────────── Katıl ─────────────────────────────

export async function joinSquad(userId: string, inviteCode: string): Promise<{ squadId: string; name: string }> {
  return prisma.$transaction(async (tx) => {
    await lockUserForUpdate(tx, userId);
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Squad" WHERE "inviteCode" = ${inviteCode} FOR UPDATE`;
    const squadId = Array.isArray(rows) ? rows[0]?.id : undefined;
    if (!squadId) throw squadError('INVITE_INVALID');
    const squad = await tx.squad.findUnique({
      where: { id: squadId },
      select: { id: true, name: true, ownerId: true, isFrozen: true },
    });
    if (!squad) throw squadError('INVITE_INVALID');

    const existing = await membershipOf(tx, userId);
    if (existing) throw squadError(existing.squadId === squad.id ? 'ALREADY_MEMBER' : 'ALREADY_IN_SQUAD');
    const owned = await tx.squad.findFirst({ where: { ownerId: userId }, select: { id: true } });
    if (owned) throw squadError('ALREADY_IN_SQUAD');
    if (squad.isFrozen) throw squadError('SQUAD_FROZEN');

    const count = await tx.squadMember.count({ where: { squadId: squad.id } });
    if (count >= SQUAD_MAX_MEMBERS) throw squadError('SQUAD_FULL');

    await tx.squadMember.create({ data: { userId, squadId: squad.id } });
    const name = await displayName(tx, userId);
    await tx.notification.create({
      data: {
        userId: squad.ownerId,
        title: 'Klanına yeni üye katıldı',
        message: `${name}, ${squad.name} klanına katıldı (${count + 1}/${SQUAD_MAX_MEMBERS}).`,
        type: 'info',
        data: { kind: 'squad_member_joined', squadId: squad.id, href: SQUADS_HREF },
      },
    });
    await writeSquadAudit(tx, userId, 'SQUAD_MEMBER_JOIN', squad.id, { userId, name });
    return { squadId: squad.id, name: squad.name };
  });
}

// ───────────────────────────── Lider işlemleri ─────────────────────────────

async function requireOwnerLocked(tx: Tx, squadId: string, ownerId: string) {
  if (!(await lockSquad(tx, squadId))) throw squadError('NOT_SQUAD_MEMBER');
  const squad = await tx.squad.findUnique({
    where: { id: squadId },
    select: { id: true, name: true, ownerId: true, isFrozen: true, description: true, weeklyTeamTarget: true },
  });
  if (!squad) throw squadError('NOT_SQUAD_MEMBER');
  if (squad.ownerId !== ownerId) throw squadError('NOT_SQUAD_OWNER');
  return squad;
}

export async function kickMember(ownerId: string, squadId: string, targetUserId: string): Promise<{ name: string }> {
  return prisma.$transaction(async (tx) => {
    const squad = await requireOwnerLocked(tx, squadId, ownerId);
    if (targetUserId === ownerId) {
      throw new ApiError('BAD_REQUEST', 'Kendini klandan çıkaramazsın; ayrılmak için "Klandan ayrıl"ı kullan.');
    }
    const member = await tx.squadMember.findFirst({
      where: { squadId, userId: targetUserId },
      select: { id: true },
    });
    if (!member) throw squadError('TARGET_NOT_MEMBER');
    if (await hasActiveBattle(tx, squadId)) throw squadError('BATTLE_LOCKED');

    await tx.squadMember.delete({ where: { id: member.id } });
    const name = await displayName(tx, targetUserId);
    await tx.notification.create({
      data: {
        userId: targetUserId,
        title: 'Klandan çıkarıldın',
        message: `${squad.name} klanının lideri seni klandan çıkardı. Yeni bir klan kurabilir ya da başka bir klana katılabilirsin.`,
        type: 'warning',
        data: { kind: 'squad_member_kicked', squadId, href: SQUADS_HREF },
      },
    });
    await writeSquadAudit(tx, ownerId, 'SQUAD_MEMBER_KICK', squadId, { userId: targetUserId, name });
    return { name };
  });
}

export async function transferOwnership(
  ownerId: string,
  squadId: string,
  targetUserId: string
): Promise<{ name: string }> {
  return prisma.$transaction(async (tx) => {
    const squad = await requireOwnerLocked(tx, squadId, ownerId);
    if (targetUserId === ownerId) throw new ApiError('BAD_REQUEST', 'Liderlik zaten sende.');
    const member = await tx.squadMember.findFirst({ where: { squadId, userId: targetUserId }, select: { id: true } });
    if (!member) throw squadError('TARGET_NOT_MEMBER');
    const ownsOther = await tx.squad.findFirst({ where: { ownerId: targetUserId }, select: { id: true } });
    if (ownsOther) throw squadError('TARGET_OWNS_SQUAD');

    await tx.squad.update({ where: { id: squadId }, data: { ownerId: targetUserId } });
    const name = await displayName(tx, targetUserId);
    await tx.notification.create({
      data: {
        userId: targetUserId,
        title: 'Klanın yeni lideri sensin',
        message: `${squad.name} klanının liderliği sana devredildi.`,
        type: 'info',
        data: { kind: 'squad_ownership_transferred', squadId, href: SQUADS_HREF },
      },
    });
    await writeSquadAudit(tx, ownerId, 'SQUAD_OWNERSHIP_TRANSFER', squadId, {
      fromUserId: ownerId,
      toUserId: targetUserId,
      toName: name,
    });
    return { name };
  });
}

export async function regenerateInviteCode(ownerId: string, squadId: string): Promise<{ inviteCode: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await requireOwnerLocked(tx, squadId, ownerId);
        const inviteCode = generateInviteCode();
        await tx.squad.update({ where: { id: squadId }, data: { inviteCode } });
        await writeSquadAudit(tx, ownerId, 'SQUAD_INVITE_ROTATE', squadId, {});
        return { inviteCode };
      });
    } catch (err) {
      if (uniqueViolationTarget(err) === null) throw err;
    }
  }
  throw new ApiError('CONFLICT', 'Yeni davet kodu üretilemedi. Lütfen tekrar deneyin.', { retryable: true });
}

export async function updateSquadProfile(
  ownerId: string,
  squadId: string,
  patch: { name?: string; description?: string | null; goalTier?: WeeklyGoalTier }
): Promise<{ name: string; description: string | null; goalTier: WeeklyGoalTier }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const squad = await requireOwnerLocked(tx, squadId, ownerId);
      if (squad.isFrozen) throw squadError('SQUAD_FROZEN');

      const data: Prisma.SquadUpdateInput = {};
      const changes: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};
      if (patch.name !== undefined && patch.name !== squad.name) {
        const clash = await tx.squad.findFirst({
          where: { name: { equals: patch.name, mode: 'insensitive' }, id: { not: squadId } },
          select: { id: true },
        });
        if (clash) throw squadError('SQUAD_NAME_TAKEN');
        data.name = patch.name;
        changes.name = patch.name;
        before.name = squad.name;
      }
      if (patch.description !== undefined) {
        const next = patch.description ? patch.description : null;
        if (next !== squad.description) {
          data.description = next;
          changes.description = next;
          before.description = squad.description;
        }
      }
      if (patch.goalTier !== undefined && patch.goalTier !== resolveGoalTier(squad.weeklyTeamTarget)) {
        data.weeklyTeamTarget = patch.goalTier;
        changes.goalTier = patch.goalTier;
        before.goalTier = resolveGoalTier(squad.weeklyTeamTarget);
      }

      if (Object.keys(changes).length > 0) {
        const updated = await tx.squad.update({
          where: { id: squadId },
          data,
          select: { name: true, description: true, weeklyTeamTarget: true },
        });
        await writeSquadAudit(tx, ownerId, 'SQUAD_UPDATE', squadId, changes, before);
        return {
          name: updated.name,
          description: updated.description,
          goalTier: resolveGoalTier(updated.weeklyTeamTarget),
        };
      }
      return { name: squad.name, description: squad.description, goalTier: resolveGoalTier(squad.weeklyTeamTarget) };
    });
  } catch (err) {
    const target = uniqueViolationTarget(err);
    if (target !== null && target.includes('name')) throw squadError('SQUAD_NAME_TAKEN');
    throw err;
  }
}
