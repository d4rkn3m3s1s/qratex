/**
 * Görev panosu — müşterinin görevlerini, ilerlemesini, ödül durumunu, serisini ve sezon
 * challenge'ını TEK sunucu hesabında üretir (sunucu otoriter; GET yazmaz, LLM yok).
 *
 * Kaynak doğruluk:
 *  - İlerleme: `live` mekanikler dönem penceresindeki kaynak kayıtlardan (lib/quests/mechanics.ts);
 *    `stored` mekanikler `UserQuest.progress`'ten (ziyaret/başarım motorları yazar).
 *  - Ödendi mi: `UserQuest.rewardedAt` (dönemli görevde `>= dönem başı`), rewardedAt öncesi
 *    claim edilmiş satırlar için `CLAIM_QUEST_REWARD` audit'i (geçiş dönemi).
 *  - Otomatik ödenen görevler (ziyaret/başarım) tamamlanınca `auto_rewarded`; claim düğmesi
 *    YOK (P0-15 / B2).
 */
import { prisma } from '@/lib/prisma';
import { getPointsMatrix, getQuestReward } from '@/lib/points-rules';
import { getActiveSeasonalCampaign } from '@/lib/seasonal-campaign-live';
import { parseChallengeSpec } from '@/lib/seasonal-event-core';
import { isAutoRewardQuest } from './reward';
import {
  countMechanicProgress,
  mechanicCta,
  mechanicTracking,
  parseRequirement,
  resolveMechanic,
  type LiveMechanic,
  type MechanicsDb,
  type ParsedRequirement,
} from './mechanics';
import {
  claimableAfterExpiry,
  getQuestPeriod,
  progressWindow,
  storedCompletionInPeriod,
  questPeriodKind,
  rewardedInPeriod,
  QUEST_CLAIM_GRACE_MS,
  type QuestPeriod,
  type QuestPeriodKind,
} from './period';
import { getActivityStreak } from './activity-streak';
import type {
  QuestBoard,
  QuestDTO,
  QuestGroup,
  QuestIcon,
  QuestState,
  SeasonChallengeDTO,
} from './board-types';

type Db = typeof prisma;

/** Panoya giren en fazla görev (aktif görev kataloğu küçük; güvenlik tavanı). */
export const BOARD_QUEST_LIMIT = 60;

export function questGroupOf(period: QuestPeriodKind): QuestGroup {
  return period === 'once' ? 'season' : period;
}

export function questIconOf(raw: string | null | undefined): QuestIcon {
  const v = (raw ?? '').trim();
  if (!v) return { kind: 'none' };
  if (v.startsWith('/') || /^https:\/\//i.test(v)) return { kind: 'image', src: v };
  // Kısa metin (emoji). Uzun/anlamsız değerler gösterilmez.
  return v.length <= 16 ? { kind: 'emoji', value: v } : { kind: 'none' };
}

/** Otomatik yolların ödediği tutar: ham `reward` (bkz. lib/visit-missions.ts, lib/achievements.ts). */
export function autoRewardOf(raw: unknown): { points: number; xp: number } {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return { points: n(o.points), xp: n(o.xp) };
}

export interface QuestRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: string;
  requirement: unknown;
  reward: unknown;
  expiresAt: Date | null;
  createdAt: Date;
  users: { id: string; progress: number; completedAt: Date | null; rewardedAt: Date | null }[];
}

export const QUEST_ROW_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  type: true,
  requirement: true,
  reward: true,
  expiresAt: true,
  createdAt: true,
} as const;

/** Bir görevin dönem/ilerleme bağlamı (pano ve claim AYNI hesabı kullanır). */
export interface QuestContext {
  mechanic: ReturnType<typeof resolveMechanic>;
  tracking: ReturnType<typeof mechanicTracking>;
  autoReward: boolean;
  period: QuestPeriod;
  req: ParsedRequirement;
  target: number;
}

export function questContext(quest: Pick<QuestRow, 'id' | 'type' | 'requirement'>, now: Date): QuestContext {
  const autoReward = isAutoRewardQuest(quest);
  const mechanic = resolveMechanic(quest);
  const req = parseRequirement(quest.requirement);
  const period = getQuestPeriod(questPeriodKind(quest.type, { autoReward }), now);
  return { mechanic, tracking: mechanicTracking(mechanic), autoReward, period, req, target: req.count };
}

/** Aynı (mekanik, pencere, eşik) için sayımı bir kez yapan önbellek. */
export function createProgressCounter(db: MechanicsDb, userId: string) {
  const memo = new Map<string, Promise<number>>();
  return (mechanic: LiveMechanic, window: { from: Date; to: Date }, req: ParsedRequirement): Promise<number> => {
    const key = `${mechanic}|${window.from.getTime()}|${window.to.getTime()}|${mechanic === 'detailed_feedback' ? req.minLength : ''}`;
    let p = memo.get(key);
    if (!p) {
      p = countMechanicProgress(db, userId, mechanic, window, req);
      memo.set(key, p);
    }
    return p;
  };
}

const STATE_ORDER: Record<QuestState, number> = { claimable: 0, in_progress: 1, claimed: 2, auto_rewarded: 3 };

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

async function loadSeasonChallenge(db: Db, userId: string, now: Date): Promise<SeasonChallengeDTO | null> {
  const active = await getActiveSeasonalCampaign(now);
  if (!active) return null;
  const campaign = await db.seasonalCampaign.findUnique({
    where: { id: active.campaignId },
    select: {
      id: true,
      name: true,
      description: true,
      startDate: true,
      endDate: true,
      challengeType: true,
      challengeGoal: true,
      challengeRewardPoints: true,
      challengeRewardBadgeId: true,
    },
  });
  if (!campaign) return null;
  const spec = parseChallengeSpec(campaign);
  if (!spec) return null;
  const range = { gte: campaign.startDate, lte: campaign.endDate };
  const [current, claim] = await Promise.all([
    spec.type === 'games_played'
      ? db.miniGameSession.count({ where: { userId, status: 'completed', completedAt: range } })
      : db.consumptionReview.count({ where: { customerId: userId, createdAt: range } }),
    db.seasonalChallengeClaim.findUnique({
      where: { userId_campaignId: { userId, campaignId: campaign.id } },
      select: { id: true },
    }),
  ]);
  return {
    campaignId: campaign.id,
    name: campaign.name,
    description: campaign.description?.trim() ? campaign.description : null,
    type: spec.type,
    current: Math.max(0, current),
    goal: spec.goal,
    rewardPoints: spec.rewardPoints,
    hasBadge: !!spec.rewardBadgeId,
    claimed: !!claim,
    endsAt: campaign.endDate.toISOString(),
  };
}

/**
 * Müşterinin görev panosu. `db` testte sahte istemci alır. Sezon challenge'ı ikincil veridir:
 * okunamazsa pano yine döner (`season: null`) ve hata loglanır — ana liste asla sessizce boşalmaz.
 */
export async function getQuestBoard(userId: string, now: Date = new Date(), db: Db = prisma): Promise<QuestBoard> {
  const graceFloor = new Date(now.getTime() - QUEST_CLAIM_GRACE_MS);
  const [rows, matrix, streak, season, account] = await Promise.all([
    db.quest.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: graceFloor } }],
      },
      select: {
        ...QUEST_ROW_SELECT,
        users: {
          where: { userId },
          select: { id: true, progress: true, completedAt: true, rewardedAt: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: BOARD_QUEST_LIMIT,
    }) as Promise<QuestRow[]>,
    getPointsMatrix(),
    getActivityStreak(db, userId, now),
    loadSeasonChallenge(db, userId, now).catch((error) => {
      console.error('[quests.board] sezon challenge okunamadı', error);
      return null;
    }),
    db.user.findUnique({ where: { id: userId }, select: { points: true } }),
  ]);

  // Geçiş dönemi: rewardedAt alanından önce claim edilmiş satırlar (audit kaydı).
  const legacyCandidates = rows
    .map((q) => q.users[0])
    .filter((uq): uq is QuestRow['users'][number] => !!uq && !uq.rewardedAt)
    .map((uq) => uq.id);
  const legacyLogs = legacyCandidates.length
    ? await db.auditLog.findMany({
        where: { userId, action: 'CLAIM_QUEST_REWARD', entity: 'UserQuest', entityId: { in: legacyCandidates } },
        select: { entityId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    : [];
  const legacyAt = new Map<string, Date>();
  for (const log of legacyLogs) {
    if (log.entityId && !legacyAt.has(log.entityId)) legacyAt.set(log.entityId, log.createdAt);
  }

  const count = createProgressCounter(db, userId);

  const built = await Promise.all(
    rows.map(async (q): Promise<QuestDTO | null> => {
      const ctx = questContext(q, now);
      const uq = q.users[0] ?? null;
      const expired = !!q.expiresAt && q.expiresAt <= now;

      // Manuel mekanik: ilerletecek motor yok → yalnız mevcut bir ilerleme varsa göster.
      if (ctx.tracking === 'manual' && !(uq && (uq.progress > 0 || uq.completedAt))) return null;

      let progress = uq?.progress ?? 0;
      if (ctx.tracking === 'live') {
        progress = await count(ctx.mechanic as LiveMechanic, progressWindow(ctx.period, q, now), ctx.req);
      }
      const target = ctx.target;

      let state: QuestState;
      let reward: { points: number; xp: number };
      if (ctx.autoReward) {
        reward = autoRewardOf(q.reward);
        const done = !!uq?.completedAt || progress >= target;
        state = done ? 'auto_rewarded' : 'in_progress';
      } else {
        reward = getQuestReward(q.reward, matrix);
        const legacy = uq ? legacyAt.get(uq.id) ?? null : null;
        const paid =
          rewardedInPeriod(uq?.rewardedAt, ctx.period) || (legacy ? rewardedInPeriod(legacy, ctx.period) : false);
        const done =
          ctx.tracking === 'live' ? progress >= target : storedCompletionInPeriod(uq, ctx.period, target);
        state = paid ? 'claimed' : done && claimableAfterExpiry(q.expiresAt, ctx.period, now) ? 'claimable' : 'in_progress';
      }

      // Süresi dolan görev: yalnız ödül penceresindeki "alınabilir" olan kalır.
      if (expired && state !== 'claimable') return null;

      const endsAt = minDate(ctx.period.end, q.expiresAt);
      const claimDeadline =
        state === 'claimable' && ctx.period.kind === 'once' && q.expiresAt
          ? new Date(q.expiresAt.getTime() + QUEST_CLAIM_GRACE_MS)
          : state === 'claimable' && ctx.period.end
            ? ctx.period.end
            : null;

      return {
        id: q.id,
        name: q.name,
        description: q.description,
        icon: questIconOf(q.icon),
        group: questGroupOf(ctx.period.kind),
        period: ctx.period.kind,
        mechanic: ctx.mechanic,
        tracking: ctx.tracking,
        rewardMode: ctx.autoReward ? 'auto' : 'claim',
        progress: state === 'claimed' || state === 'auto_rewarded' ? target : Math.min(progress, target),
        target,
        reward,
        state,
        endsAt: expired ? null : iso(endsAt),
        claimDeadline: iso(claimDeadline),
        rewardedAt: iso(uq?.rewardedAt ?? (uq ? legacyAt.get(uq.id) ?? null : null)),
        cta: state === 'in_progress' ? mechanicCta(ctx.mechanic, q.id) : null,
      };
    })
  );

  const quests = built
    .filter((q): q is QuestDTO => q !== null)
    .sort((a, b) => {
      const s = STATE_ORDER[a.state] - STATE_ORDER[b.state];
      if (s !== 0) return s;
      return b.progress / b.target - a.progress / a.target;
    });

  const groups: QuestBoard['summary']['groups'] = {
    daily: { done: 0, total: 0 },
    weekly: { done: 0, total: 0 },
    monthly: { done: 0, total: 0 },
    season: { done: 0, total: 0 },
  };
  const pending = { count: 0, points: 0, xp: 0 };
  for (const q of quests) {
    groups[q.group].total += 1;
    if (q.state !== 'in_progress') groups[q.group].done += 1;
    if (q.state === 'claimable') {
      pending.count += 1;
      pending.points += q.reward.points;
      pending.xp += q.reward.xp;
    }
  }

  return {
    generatedAt: now.toISOString(),
    quests,
    season,
    summary: { pending, groups },
    streak,
    balance: Math.max(0, account?.points ?? 0),
    periodEnds: {
      daily: getQuestPeriod('daily', now).end!.toISOString(),
      weekly: getQuestPeriod('weekly', now).end!.toISOString(),
      monthly: getQuestPeriod('monthly', now).end!.toISOString(),
    },
  };
}
