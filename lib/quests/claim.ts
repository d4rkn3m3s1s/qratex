/**
 * Görev ödülü alma — tekil ve toplu ("Hepsini al"). Sunucu otoriter:
 *  - İlerleme claim anında YENİDEN hesaplanır (istemcinin "tamamlandı" demesine güvenilmez).
 *  - Otomatik ödenen görevler (ziyaret/başarım) buradan ödenmez → `QUEST_AUTO_REWARDED` (B2).
 *  - Dönemli görevde saklanan ilerleme yalnız bu dönemde ve son ödemeden sonra tamamlandıysa
 *    sayılır; süresi dolan görevde ek süre yalnız bittiği dönem için geçerlidir (period.ts).
 *  - Tek sefer: satır kilidi (`FOR UPDATE`) + koşullu `updateMany` (tek seferlikte
 *    `rewardedAt: null`, dönemlide `rewardedAt < dönem başı`) — count===0 ise ödeme yok.
 *    Kredi `mintPoints` ile aynı tx'te; defter anahtarı `quest:<userQuestId>` (tek seferlik,
 *    eski claim ucuyla aynı) ya da `quest:<userQuestId>:<dönemAnahtarı>` (dönemli).
 *  - Seviye atlama anı `creditPointsAndXp` içinde An Motoru'na yazılır (lib/moments/server.ts);
 *    istemci yanıt sonrası `moments.points()` + `moments.refresh()` çağırır.
 */
import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy';
import { getPointsMatrix, getQuestReward } from '@/lib/points-rules';
import type { LiveMechanic } from './mechanics';
import { claimableAfterExpiry, QUEST_CLAIM_GRACE_MS, rewardedInPeriod, storedCompletionInPeriod } from './period';
import { createProgressCounter, questContext, QUEST_ROW_SELECT, type QuestRow } from './board';
import type { QuestClaimErrorCode, QuestClaimItem, QuestClaimResult } from './board-types';

type Db = typeof prisma;

export const QUEST_CLAIM_ERRORS: Readonly<Record<QuestClaimErrorCode, { status: number; message: string }>> = {
  QUEST_NOT_FOUND: { status: 404, message: 'Görev bulunamadı ya da artık aktif değil.' },
  QUEST_EXPIRED: { status: 410, message: 'Bu görevin süresi ve ödül alma penceresi doldu.' },
  QUEST_AUTO_REWARDED: { status: 409, message: 'Bu görevin ödülü tamamlandığında otomatik olarak hesabına işlenir.' },
  QUEST_NOT_TRACKED: { status: 409, message: 'Bu görevin ilerlemesi henüz tamamlanmış görünmüyor.' },
  QUEST_NOT_COMPLETED: { status: 409, message: 'Görev henüz tamamlanmadı.' },
  QUEST_ALREADY_CLAIMED: { status: 409, message: 'Bu görevin ödülünü bu dönem zaten aldın.' },
  QUEST_CLAIM_FAILED: { status: 500, message: 'Ödül şu an alınamadı. Lütfen tekrar dene.' },
};

export class QuestClaimError extends Error {
  readonly code: QuestClaimErrorCode;
  readonly status: number;
  constructor(code: QuestClaimErrorCode) {
    super(QUEST_CLAIM_ERRORS[code].message);
    this.name = 'QuestClaimError';
    this.code = code;
    this.status = QUEST_CLAIM_ERRORS[code].status;
  }
}

export function isQuestClaimError(e: unknown): e is QuestClaimError {
  return e instanceof QuestClaimError;
}

export interface ClaimOptions {
  now?: Date;
  db?: Db;
  auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
}

interface PaidQuest {
  item: QuestClaimItem;
  balance: number;
  xp: number;
  level: number;
  isLevelUp: boolean;
}

type Counter = ReturnType<typeof createProgressCounter>;

async function ensureUserQuestRow(db: Db, userId: string, questId: string, progress: number): Promise<string> {
  try {
    const row = await db.userQuest.upsert({
      where: { userId_questId: { userId, questId } },
      update: {},
      create: { userId, questId, progress },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    // Eşzamanlı ilk oluşturma (P2002) → satır artık var.
    const row = await db.userQuest.findUnique({ where: { userId_questId: { userId, questId } }, select: { id: true } });
    if (!row) throw error;
    return row.id;
  }
}

async function payQuest(
  db: Db,
  userId: string,
  quest: Omit<QuestRow, 'users'>,
  matrix: Awaited<ReturnType<typeof getPointsMatrix>>,
  count: Counter,
  now: Date,
  auditMeta: ClaimOptions['auditMeta']
): Promise<PaidQuest> {
  const ctx = questContext(quest, now);
  if (ctx.autoReward) throw new QuestClaimError('QUEST_AUTO_REWARDED');
  if (!claimableAfterExpiry(quest.expiresAt, ctx.period, now)) {
    throw new QuestClaimError('QUEST_EXPIRED');
  }

  const once = ctx.period.kind === 'once';
  // İlerleme görevin bitişinden sonra sayılmaz (ek süre yalnız ödülü ALMAK içindir).
  const until = quest.expiresAt && quest.expiresAt < now ? quest.expiresAt : now;
  let liveProgress: number | null = null;
  if (ctx.tracking === 'live') {
    const window = once ? { from: quest.createdAt, to: until } : { from: ctx.period.start, to: until };
    liveProgress = await count(ctx.mechanic as LiveMechanic, window, ctx.req);
    if (liveProgress < ctx.target) throw new QuestClaimError('QUEST_NOT_COMPLETED');
  }

  const reward = getQuestReward(quest.reward, matrix);
  const rowId = await ensureUserQuestRow(db, userId, quest.id, liveProgress !== null ? Math.min(liveProgress, ctx.target) : 0);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UserQuest" WHERE id = ${rowId} FOR UPDATE`;
    const fresh = await tx.userQuest.findUnique({
      where: { id: rowId },
      select: { progress: true, completedAt: true, rewardedAt: true },
    });
    if (!fresh) throw new QuestClaimError('QUEST_NOT_FOUND');

    if (ctx.tracking !== 'live') {
      const done = storedCompletionInPeriod(fresh, ctx.period, ctx.target);
      if (!done) throw new QuestClaimError(ctx.tracking === 'manual' ? 'QUEST_NOT_TRACKED' : 'QUEST_NOT_COMPLETED');
    }
    if (rewardedInPeriod(fresh.rewardedAt, ctx.period)) throw new QuestClaimError('QUEST_ALREADY_CLAIMED');

    // Geçiş dönemi: rewardedAt alanından önce claim edilmiş satır (bu dönemde).
    const legacy = await tx.auditLog.findFirst({
      where: {
        userId,
        action: 'CLAIM_QUEST_REWARD',
        entity: 'UserQuest',
        entityId: rowId,
        ...(once ? {} : { createdAt: { gte: ctx.period.start } }),
      },
      select: { id: true },
    });
    if (legacy) throw new QuestClaimError('QUEST_ALREADY_CLAIMED');

    const guard = await tx.userQuest.updateMany({
      where: once
        ? { id: rowId, userId, rewardedAt: null }
        : { id: rowId, userId, OR: [{ rewardedAt: null }, { rewardedAt: { lt: ctx.period.start } }] },
      data: {
        rewardedAt: now,
        completedAt: once ? fresh.completedAt ?? now : now,
        progress: liveProgress !== null ? Math.min(liveProgress, ctx.target) : fresh.progress,
      },
    });
    if (guard.count === 0) throw new QuestClaimError('QUEST_ALREADY_CLAIMED');

    const minted = await mintPoints(tx, {
      userId,
      points: reward.points,
      xp: reward.xp,
      source: 'quest',
      sourceId: rowId,
      idempotencyKey: once ? `quest:${rowId}` : `quest:${rowId}:${ctx.period.key}`,
      meta: { questId: quest.id, period: ctx.period.key },
      now,
    });
    // Defter bu ödemeyi zaten tanıyor → bayrak çevirmesi geri alınır (tx rollback), kredi yok.
    if (minted.duplicate) throw new QuestClaimError('QUEST_ALREADY_CLAIMED');

    await tx.notification.create({
      data: {
        userId,
        title: 'Görev ödülü alındı',
        message: `${quest.name}: +${minted.credited} puan, +${minted.xpCredited} XP hesabına işlendi.`,
        type: 'success',
        data: { questId: quest.id, period: ctx.period.key, points: minted.credited, xp: minted.xpCredited },
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: 'CLAIM_QUEST_REWARD',
        entity: 'UserQuest',
        entityId: rowId,
        newData: {
          questId: quest.id,
          questName: quest.name,
          period: ctx.period.key,
          points: minted.credited,
          xp: minted.xpCredited,
          ledgerId: minted.ledgerId,
        },
        ...(auditMeta ?? {}),
      },
    });

    return {
      item: { questId: quest.id, name: quest.name, points: minted.credited, xp: minted.xpCredited },
      balance: minted.points,
      xp: minted.xp,
      level: minted.level,
      isLevelUp: minted.isLevelUp,
    };
  });
}

function emptyResult(): QuestClaimResult {
  return { claimed: [], skipped: [], totals: { points: 0, xp: 0 }, balance: null, xp: null, level: null, levelUp: false };
}

function addPaid(result: QuestClaimResult, paid: PaidQuest): void {
  result.claimed.push(paid.item);
  result.totals.points += paid.item.points;
  result.totals.xp += paid.item.xp;
  result.balance = paid.balance;
  result.xp = paid.xp;
  result.level = paid.level;
  result.levelUp = result.levelUp || paid.isLevelUp;
}

/** Tek görevin ödülünü alır. Hata → `QuestClaimError` (kodlu). */
export async function claimQuest(userId: string, questId: string, opts: ClaimOptions = {}): Promise<QuestClaimResult> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const quest = await db.quest.findFirst({
    where: { id: questId, isActive: true, archivedAt: null },
    select: QUEST_ROW_SELECT,
  });
  if (!quest) throw new QuestClaimError('QUEST_NOT_FOUND');
  const matrix = await getPointsMatrix();
  const result = emptyResult();
  addPaid(result, await payQuest(db, userId, quest, matrix, createProgressCounter(db, userId), now, opts.auditMeta));
  return result;
}

/** "Hepsini al" — tek istekte en fazla bu kadar görev. */
export const CLAIM_ALL_LIMIT = 20;

/**
 * Alınabilir bütün görev ödüllerini sırayla alır (her biri kendi tx'inde; biri düşerse diğerleri
 * etkilenmez). Alınamayanlar `skipped` içinde koduyla döner.
 */
export async function claimAllQuests(userId: string, opts: ClaimOptions = {}): Promise<QuestClaimResult> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const graceFloor = new Date(now.getTime() - QUEST_CLAIM_GRACE_MS);
  const rows = (await db.quest.findMany({
    where: { isActive: true, archivedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: graceFloor } }] },
    select: {
      ...QUEST_ROW_SELECT,
      users: { where: { userId }, select: { id: true, progress: true, completedAt: true, rewardedAt: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })) as QuestRow[];

  const matrix = await getPointsMatrix();
  const count = createProgressCounter(db, userId);
  const result = emptyResult();

  const candidates = rows.filter((q) => {
    const ctx = questContext(q, now);
    if (ctx.autoReward) return false;
    if (rewardedInPeriod(q.users[0]?.rewardedAt, ctx.period)) return false;
    if (!claimableAfterExpiry(q.expiresAt, ctx.period, now)) return false;
    if (ctx.tracking === 'manual') return storedCompletionInPeriod(q.users[0], ctx.period, ctx.target);
    return true;
  });

  for (const q of candidates) {
    if (result.claimed.length >= CLAIM_ALL_LIMIT) break;
    const { users: _users, ...quest } = q;
    void _users;
    try {
      addPaid(result, await payQuest(db, userId, quest, matrix, count, now, opts.auditMeta));
    } catch (error) {
      if (!isQuestClaimError(error)) {
        // Beklenmeyen hata: o ana kadar alınanlar commit'lendi; hiçbiri alınmadıysa hata görünür.
        if (result.claimed.length === 0) throw error;
        console.error('[quests.claimAll] toplu alım yarıda kaldı', error);
        result.skipped.push({ questId: q.id, code: 'QUEST_CLAIM_FAILED' });
        break;
      }
      // Tamamlanmamış görevler toplu alımda sessizce atlanır; diğer kodlar bildirilir.
      if (error.code !== 'QUEST_NOT_COMPLETED') result.skipped.push({ questId: q.id, code: error.code });
    }
  }
  return result;
}
