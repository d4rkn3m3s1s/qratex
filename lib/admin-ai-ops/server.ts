/**
 * /admin/ai — AI Operasyon Merkezi sunucu katmanı (salt okuma toplamları + kuyruk/bayi yazmaları).
 *
 *  - Bütün sayılar DB'de (`count/groupBy/$queryRaw`), tek dönem penceresiyle ve `deletedAt` hariç.
 *  - AI sağlığı KALICI `AIUsageLog`'dan (başarısız çağrılar dahil); bellek-içi sayaç yok (B3).
 *  - GET'te LLM yok; asistan yalnız mevcut geçitten (`askAI` → `guardAiCall` + kullanım kaydı).
 *  - Kuyruk işleme `ai-retry` cron'uyla AYNI hattı (`runFeedbackAnalyzePipeline`) ve aynı
 *    politika kapısını kullanır; sahte sinyal yazılmaz (B1'in güvenli karşılığı).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  AI_DAILY_TOKEN_LIMIT_PER_DEALER,
  AI_GLOBAL_DAILY_TOKEN_LIMITS,
  AI_UNSCOPED_DAILY_TOKEN_LIMIT,
  getTodayUnscopedUsage,
  getTodayUsageByAction,
} from '@/lib/ai-cost-guard';
import { askAI, getAIProviderStatus, isAIConfigured, type AskAIContext } from '@/lib/ai-engine';
import { dealerAutoAnalyzeAllowedWhere, invalidateDealerAiPolicy } from '@/lib/ai-policy';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { ApiError } from '@/lib/http/define-route';
import { MAX_AI_ATTEMPTS, MIN_ANALYZABLE_TEXT_LENGTH, runFeedbackAnalyzePipeline } from '@/lib/inngest/feedback-analyze-pipeline';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import {
  CHURN_BUCKETS,
  CHURN_HIGH_MIN,
  INTENT_LABEL,
  SENTIMENT_LABEL,
  SYNTHETIC_MODEL,
  URGENCY_BUCKETS,
  URGENT_MIN,
  EMOTION_LABEL,
  actionLabel,
  classifyHealth,
  dealerRiskScore,
  isAskAiFailure,
  modelKind,
  pct,
  periodWindow,
  preview,
  signalTitle,
  type AiOpsPeriod,
  type AssistantAnswer,
  type AssistantInput,
  type BacklogAction,
  type BacklogActionResult,
  type BacklogSummary,
  type BudgetReport,
  type DealerAiPatch,
  type DealerAiRow,
  type DealersPage,
  type DealersQuery,
  type Dist,
  type ErrorsPage,
  type ErrorsQuery,
  type PendingPage,
  type PendingQuery,
  type PeriodWindow,
  type ProcessResult,
  type SeriesPoint,
  type SignalFeedbacksPage,
  type SignalFeedbacksQuery,
  type SignalsReport,
  type UsageReport,
  type UsageRow,
  type UsageTotals,
} from './contract';

type Db = PrismaClient;
type Req = { headers: { get(name: string): string | null } } | null | undefined;

/** Kuyruk penceresi — ai-retry cron'uyla aynı (30 gün). */
export const BACKLOG_LOOKBACK_DAYS = 30;
const CACHE_TTL_S = 60;
const IST_OFFSET_MS = 3 * 3600_000; // Europe/Istanbul 2016'dan beri sabit UTC+3.

const n = (v: unknown): number => {
  if (v == null) return 0;
  const x = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const nOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const round = (v: number | null, d = 0): number | null => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

async function cached<T>(key: string, fresh: boolean, compute: () => Promise<T>): Promise<T> {
  if (!fresh) {
    const hit = await redisGetJson<T>(key);
    if (hit) return hit;
  }
  const value = await compute();
  await redisSetJson(key, value, CACHE_TTL_S);
  return value;
}

function lookbackStart(now = Date.now()): Date {
  return new Date(now - BACKLOG_LOOKBACK_DAYS * 86400_000);
}

/** İstanbul yerel kova anahtarı: gün "YYYY-MM-DD", saat "YYYY-MM-DDTHH:00". */
export function istanbulBucketKey(at: Date, bucket: 'hour' | 'day'): string {
  const local = new Date(at.getTime() + IST_OFFSET_MS).toISOString();
  return bucket === 'day' ? local.slice(0, 10) : `${local.slice(0, 13)}:00`;
}

/** Dönemin bütün kovaları (boş kovalar sıfırla doldurulur → grafik boşluğu = veri yok değil). */
export function bucketKeys(w: Pick<PeriodWindow, 'from' | 'to' | 'bucket'>): string[] {
  const step = w.bucket === 'hour' ? 3600_000 : 86400_000;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let t = w.from.getTime(); t <= w.to.getTime(); t += step) {
    const k = istanbulBucketKey(new Date(t), w.bucket);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  const last = istanbulBucketKey(w.to, w.bucket);
  if (!seen.has(last)) keys.push(last);
  return keys;
}

const LOCAL = (col: Prisma.Sql) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')`;

// ───────────────────────────── Kullanım ─────────────────────────────

type TotalsRaw = { calls: unknown; failures: unknown; tin: unknown; tout: unknown; p50: unknown; p95: unknown; fb: unknown };

function toTotals(r: TotalsRaw | undefined): UsageTotals {
  const calls = n(r?.calls);
  const failures = n(r?.failures);
  return {
    calls,
    failures,
    errorRate: pct(failures, calls),
    inputTokens: n(r?.tin),
    outputTokens: n(r?.tout),
    p50Ms: round(nOrNull(r?.p50)),
    p95Ms: round(nOrNull(r?.p95)),
    fallbackCalls: n(r?.fb),
  };
}

async function usageTotals(db: Db, from: Date, to: Date): Promise<UsageTotals> {
  const rows = await db.$queryRaw<TotalsRaw[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS calls,
           COUNT(*) FILTER (WHERE NOT u."success")::bigint AS failures,
           COALESCE(SUM(u."inputTokens"), 0)::bigint AS tin,
           COALESCE(SUM(u."outputTokens"), 0)::bigint AS tout,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY u."latencyMs") FILTER (WHERE u."success" AND u."latencyMs" > 0) AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY u."latencyMs") FILTER (WHERE u."success" AND u."latencyMs" > 0) AS p95,
           COUNT(*) FILTER (WHERE u."model" ILIKE '%fallback%' OR u."model" ILIKE 'local%')::bigint AS fb
      FROM "AIUsageLog" u
     WHERE u."createdAt" >= ${from} AND u."createdAt" < ${to}`);
  return toTotals(rows[0]);
}

type GroupRaw = { k: string | null; calls: unknown; failures: unknown; tokens: unknown; p95: unknown };

function toRows(raw: GroupRaw[], label: (k: string) => string): UsageRow[] {
  return raw.map((r) => {
    const key = r.k ?? '—';
    const calls = n(r.calls);
    const failures = n(r.failures);
    return { key, label: label(key), calls, failures, errorRate: pct(failures, calls), tokens: n(r.tokens), p95Ms: round(nOrNull(r.p95)) };
  });
}

export async function getUsageReport(db: Db, period: AiOpsPeriod, opts: { fresh?: boolean; now?: Date } = {}): Promise<UsageReport> {
  return cached(`ai-ops:usage:${period}`, !!opts.fresh, async () => {
    const w = periodWindow(period, opts.now);
    const unit = w.bucket === 'hour' ? 'hour' : 'day';
    const fmt = w.bucket === 'hour' ? 'YYYY-MM-DD"T"HH24:00' : 'YYYY-MM-DD';
    const at = LOCAL(Prisma.sql`u."createdAt"`);
    const [totals, previous, seriesRaw, byActionRaw, byModelRaw] = await Promise.all([
      usageTotals(db, w.from, w.to),
      usageTotals(db, w.prevFrom, w.prevTo),
      db.$queryRaw<Array<{ k: string; calls: unknown; failures: unknown; tokens: unknown }>>(Prisma.sql`
        SELECT to_char(date_trunc(${unit}, ${at}), ${fmt}) AS k,
               COUNT(*)::bigint AS calls,
               COUNT(*) FILTER (WHERE NOT u."success")::bigint AS failures,
               COALESCE(SUM(u."inputTokens" + u."outputTokens"), 0)::bigint AS tokens
          FROM "AIUsageLog" u
         WHERE u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to}
         GROUP BY 1`),
      db.$queryRaw<GroupRaw[]>(Prisma.sql`
        SELECT u."action" AS k, COUNT(*)::bigint AS calls,
               COUNT(*) FILTER (WHERE NOT u."success")::bigint AS failures,
               COALESCE(SUM(u."inputTokens" + u."outputTokens"), 0)::bigint AS tokens,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY u."latencyMs") FILTER (WHERE u."success" AND u."latencyMs" > 0) AS p95
          FROM "AIUsageLog" u
         WHERE u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to}
         GROUP BY 1 ORDER BY calls DESC LIMIT 30`),
      db.$queryRaw<GroupRaw[]>(Prisma.sql`
        SELECT u."model" AS k, COUNT(*)::bigint AS calls,
               COUNT(*) FILTER (WHERE NOT u."success")::bigint AS failures,
               COALESCE(SUM(u."inputTokens" + u."outputTokens"), 0)::bigint AS tokens,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY u."latencyMs") FILTER (WHERE u."success" AND u."latencyMs" > 0) AS p95
          FROM "AIUsageLog" u
         WHERE u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to}
         GROUP BY 1 ORDER BY calls DESC LIMIT 20`),
    ]);
    const map = new Map(seriesRaw.map((r) => [r.k, r]));
    const series: SeriesPoint[] = bucketKeys(w).map((k) => {
      const r = map.get(k);
      return { at: k, calls: n(r?.calls), failures: n(r?.failures), tokens: n(r?.tokens) };
    });
    const provider = getAIProviderStatus();
    return {
      period,
      generatedAt: new Date().toISOString(),
      provider,
      health: classifyHealth({ configured: provider.configured, calls: totals.calls, failures: totals.failures, p95Ms: totals.p95Ms }),
      totals,
      previous,
      series,
      bucket: w.bucket,
      byAction: toRows(byActionRaw, actionLabel),
      byModel: toRows(byModelRaw, (k) => k),
    };
  });
}

/** Muhafızla AYNI gün sınırı (UTC gece yarısı). */
function guardDayStart(now = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const gauge = (key: string, label: string, used: number, limit: number) => ({
  key,
  label,
  used,
  limit,
  percent: limit > 0 ? Math.min(999, Math.round((used / limit) * 1000) / 10) : 0,
});

export async function getBudgetReport(db: Db): Promise<BudgetReport> {
  const start = guardDayStart();
  const [unscoped, qra, system, top] = await Promise.all([
    getTodayUnscopedUsage(),
    getTodayUsageByAction(['qra_chat']),
    getTodayUsageByAction(['system_learning']),
    db.$queryRaw<Array<{ id: string; name: string | null; business: string | null; used: unknown }>>(Prisma.sql`
      SELECT u."dealerId" AS id, d."name" AS name, d."businessName" AS business,
             SUM(u."inputTokens" + u."outputTokens")::bigint AS used
        FROM "AIUsageLog" u
        LEFT JOIN "User" d ON d."id" = u."dealerId"
       WHERE u."dealerId" IS NOT NULL AND u."createdAt" >= ${start}
       GROUP BY 1, 2, 3
       ORDER BY used DESC
       LIMIT 8`),
  ]);
  const limit = AI_DAILY_TOKEN_LIMIT_PER_DEALER;
  return {
    generatedAt: new Date().toISOString(),
    dayStartsAt: start.toISOString(),
    platform: [
      gauge('unscoped', 'Platform (bayisiz) çağrılar', unscoped, AI_UNSCOPED_DAILY_TOKEN_LIMIT),
      gauge('qra_chat', 'QRA sohbet', qra, AI_GLOBAL_DAILY_TOKEN_LIMITS.qra_chat),
      gauge('system_learning', 'Sistem öğrenmesi', system, AI_GLOBAL_DAILY_TOKEN_LIMITS.system_learning),
    ],
    dealerLimit: limit,
    topDealers: top.map((r) => ({
      dealerId: r.id,
      name: r.business || r.name || 'Adsız bayi',
      used: n(r.used),
      percent: limit > 0 ? Math.round((n(r.used) / limit) * 1000) / 10 : 0,
    })),
  };
}

export async function getErrors(db: Db, q: ErrorsQuery): Promise<ErrorsPage> {
  const w = periodWindow(q.period);
  const where: Prisma.AIUsageLogWhereInput = {
    success: false,
    createdAt: { gte: w.from, lt: w.to },
    ...(q.action ? { action: q.action } : {}),
  };
  const [total, rows] = await Promise.all([
    db.aIUsageLog.count({ where }),
    db.aIUsageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.size,
      take: q.size,
      select: { id: true, createdAt: true, action: true, model: true, dealerId: true, latencyMs: true, error: true },
    }),
  ]);
  const ids = Array.from(new Set(rows.map((r) => r.dealerId).filter((x): x is string => !!x)));
  const dealers = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, businessName: true } })
    : [];
  const names = new Map(dealers.map((d) => [d.id, d.businessName || d.name || 'Adsız bayi']));
  return {
    items: rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      action: r.action,
      model: r.model,
      dealerId: r.dealerId,
      dealerName: r.dealerId ? names.get(r.dealerId) ?? 'Silinmiş bayi' : null,
      latencyMs: r.latencyMs,
      error: (r.error ?? 'Hata metni kaydedilmemiş').slice(0, 500),
    })),
    total,
    page: q.page,
    size: q.size,
  };
}

// ───────────────────────────── Kuyruk ─────────────────────────────

const pendingBase = (): Prisma.FeedbackWhereInput => ({ aiProcessedAt: null, text: { not: null }, deletedAt: null });
const policyBlocked = (): Prisma.UserWhereInput => ({
  aiSettings: { is: { OR: [{ isEnabled: false }, { autoAnalyze: false }] } },
});

export function pendingWhere(state: PendingQuery['state'], now = Date.now()): Prisma.FeedbackWhereInput {
  const lb = lookbackStart(now);
  switch (state) {
    case 'eligible':
      return { ...pendingBase(), aiAttempts: { lt: MAX_AI_ATTEMPTS }, createdAt: { gte: lb }, qrCode: { dealer: dealerAutoAnalyzeAllowedWhere() } };
    case 'exhausted':
      return { ...pendingBase(), aiAttempts: { gte: MAX_AI_ATTEMPTS }, createdAt: { gte: lb } };
    case 'blocked':
      return { ...pendingBase(), aiAttempts: { lt: MAX_AI_ATTEMPTS }, createdAt: { gte: lb }, qrCode: { dealer: policyBlocked() } };
    case 'stale':
      return { ...pendingBase(), createdAt: { lt: lb } };
  }
}

const syntheticWhere = (): Prisma.FeedbackWhereInput => ({ aiModelUsed: SYNTHETIC_MODEL, qrCode: { dealer: { isDemo: false } } });

export async function getBacklogSummary(db: Db): Promise<BacklogSummary> {
  const now = Date.now();
  const [eligible, oldest, exhausted, blocked, stale, synthetic] = await Promise.all([
    db.feedback.count({ where: pendingWhere('eligible', now) }),
    db.feedback.findFirst({ where: pendingWhere('eligible', now), orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.feedback.count({ where: pendingWhere('exhausted', now) }),
    db.feedback.count({ where: pendingWhere('blocked', now) }),
    db.feedback.count({ where: pendingWhere('stale', now) }),
    db.feedback.count({ where: { ...syntheticWhere(), deletedAt: null } }),
  ]);
  return {
    generatedAt: new Date(now).toISOString(),
    eligible,
    oldestEligibleAt: oldest?.createdAt.toISOString() ?? null,
    exhausted,
    blockedByPolicy: blocked,
    stale,
    synthetic,
    maxAttempts: MAX_AI_ATTEMPTS,
    lookbackDays: BACKLOG_LOOKBACK_DAYS,
  };
}

export async function getPendingPage(db: Db, q: PendingQuery): Promise<PendingPage> {
  const where = pendingWhere(q.state);
  const [total, rows] = await Promise.all([
    db.feedback.count({ where }),
    db.feedback.findMany({
      where,
      orderBy: { createdAt: q.state === 'eligible' ? 'asc' : 'desc' },
      skip: (q.page - 1) * q.size,
      take: q.size,
      select: {
        id: true,
        createdAt: true,
        aiAttempts: true,
        aiLastAttemptAt: true,
        rating: true,
        text: true,
        qrCode: { select: { dealerId: true, dealer: { select: { name: true, businessName: true } } } },
      },
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      dealerId: r.qrCode.dealerId,
      dealerName: r.qrCode.dealer?.businessName || r.qrCode.dealer?.name || 'Adsız bayi',
      createdAt: r.createdAt.toISOString(),
      attempts: r.aiAttempts,
      lastAttemptAt: r.aiLastAttemptAt?.toISOString() ?? null,
      rating: r.rating,
      preview: preview(r.text, 140),
    })),
    total,
    page: q.page,
    size: q.size,
  };
}

const PER_ITEM_MS = 8_000;
const PROCESS_BUDGET_MS = 25_000;
const TIMED_OUT = Symbol('timeout');
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => timer && clearTimeout(timer)),
    new Promise<typeof TIMED_OUT>((r) => {
      timer = setTimeout(() => r(TIMED_OUT), ms);
    }),
  ]);
}

/** Kuyruktan en eski kayıtları şimdi işle — cron'la aynı hat, zaman bütçeli, sahte sinyal yok. */
export async function processBacklog(db: Db, limit: number, opts: { budgetMs?: number; perItemMs?: number } = {}): Promise<ProcessResult> {
  if (!isAIConfigured()) throw new ApiError('SERVICE_UNAVAILABLE', 'AI sağlayıcısı yapılandırılmamış; kuyruk işlenemez.');
  const startedAt = Date.now();
  const budget = opts.budgetMs ?? PROCESS_BUDGET_MS;
  const perItem = opts.perItemMs ?? PER_ITEM_MS;
  // İlk (olay) analiziyle yarışmamak için 3 dk'dan eski kayıtlar (cron'la aynı kural).
  const where = pendingWhere('eligible', startedAt);
  const candidates = await db.feedback.findMany({
    where: { ...where, createdAt: { gte: lookbackStart(startedAt), lt: new Date(startedAt - 3 * 60_000) } },
    orderBy: [{ aiAttempts: 'asc' }, { createdAt: 'asc' }],
    take: limit * 2,
    select: { id: true, text: true },
  });
  const queue = candidates.filter((c) => (c.text ?? '').trim().length >= MIN_ANALYZABLE_TEXT_LENGTH).slice(0, limit);
  const res: ProcessResult = { processed: 0, upgraded: 0, stillFallback: 0, skipped: 0, failed: 0, timeouts: 0, stoppedByBudget: false, tookMs: 0 };
  for (const f of queue) {
    if (Date.now() - startedAt + perItem > budget) {
      res.stoppedByBudget = true;
      break;
    }
    res.processed++;
    try {
      const r = await withTimeout(runFeedbackAnalyzePipeline(f.id, { source: 'retry' }), perItem);
      if (r === TIMED_OUT) res.timeouts++;
      else if ('skipped' in r) res.skipped++;
      else if (r.completed) res.upgraded++;
      else res.stillFallback++;
    } catch (err) {
      res.failed++;
      console.error('[ai-ops] kuyruk işleme hatası:', err instanceof Error ? err.message : err);
    }
  }
  res.tookMs = Date.now() - startedAt;
  return res;
}

export async function retryOne(db: Db, feedbackId: string): Promise<Extract<BacklogActionResult, { action: 'retry_one' }>> {
  if (!isAIConfigured()) throw new ApiError('SERVICE_UNAVAILABLE', 'AI sağlayıcısı yapılandırılmamış.');
  const f = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { id: true, deletedAt: true, aiProcessedAt: true, text: true, aiAttempts: true },
  });
  if (!f || f.deletedAt) throw new ApiError('NOT_FOUND', 'Geri bildirim bulunamadı.');
  if (f.aiProcessedAt) throw new ApiError('CONFLICT', 'Bu geri bildirim zaten analiz edilmiş.');
  if (!f.text || f.text.trim().length < MIN_ANALYZABLE_TEXT_LENGTH) throw new ApiError('BAD_REQUEST', 'Metin analiz için çok kısa.');
  // Hakkı bittiyse yalnız BİR hak daha verilir (sonsuz döngü yok).
  if (f.aiAttempts >= MAX_AI_ATTEMPTS) {
    await db.feedback.updateMany({ where: { id: f.id, aiProcessedAt: null }, data: { aiAttempts: MAX_AI_ATTEMPTS - 1 } });
  }
  try {
    const r = await withTimeout(runFeedbackAnalyzePipeline(f.id, { source: 'retry' }), 15_000);
    if (r === TIMED_OUT) return { action: 'retry_one', outcome: 'timeout' };
    if ('skipped' in r) return { action: 'retry_one', outcome: 'skipped', reason: r.reason };
    return { action: 'retry_one', outcome: r.completed ? 'upgraded' : 'fallback' };
  } catch (err) {
    console.error('[ai-ops] tekil yeniden deneme hatası:', err instanceof Error ? err.message : err);
    return { action: 'retry_one', outcome: 'failed' };
  }
}

export async function runBacklogAction(db: Db, input: BacklogAction, actor: AuditActor, request?: Req): Promise<BacklogActionResult> {
  const audit = (action: string, newData: unknown, entityId?: string) =>
    db.auditLog.create({ data: auditEntry(actor, { action, entity: 'Feedback', entityId: entityId ?? null, newData }, request) });

  switch (input.action) {
    case 'process': {
      const result = await processBacklog(db, input.limit);
      await audit('ai_ops.backlog.process', result);
      return { action: 'process', result };
    }
    case 'retry_one': {
      const out = await retryOne(db, input.feedbackId);
      await audit('ai_ops.backlog.retry_one', out, input.feedbackId);
      return out;
    }
    case 'requeue_exhausted': {
      const count = await db.$transaction(async (tx) => {
        const r = await tx.feedback.updateMany({ where: pendingWhere('exhausted'), data: { aiAttempts: 0 } });
        await tx.auditLog.create({
          data: auditEntry(actor, { action: 'ai_ops.backlog.requeue_exhausted', entity: 'Feedback', newData: { count: r.count, reason: input.reason } }, request),
        });
        return r.count;
      });
      return { action: 'requeue_exhausted', count };
    }
    case 'clear_synthetic': {
      const count = await db.$transaction(async (tx) => {
        const r = await tx.feedback.updateMany({
          where: syntheticWhere(),
          data: {
            intent: null,
            urgency: null,
            churnRisk: null,
            effortScore: null,
            aiModelUsed: null,
            aiVersion: null,
            aiProcessedAt: null,
            aiAttempts: 0,
            aiAnalysis: Prisma.DbNull,
          },
        });
        await tx.auditLog.create({
          data: auditEntry(actor, { action: 'ai_ops.backlog.clear_synthetic', entity: 'Feedback', newData: { count: r.count, reason: input.reason } }, request),
        });
        return r.count;
      });
      return { action: 'clear_synthetic', count };
    }
  }
}

// ───────────────────────────── Bayiler ─────────────────────────────

type DealerRaw = {
  id: string;
  name: string | null;
  business: string | null;
  is_demo: boolean;
  is_enabled: boolean | null;
  auto_analyze: boolean | null;
  has_settings: boolean;
  calls: unknown;
  failures: unknown;
  tokens: unknown;
  today: unknown;
  total: unknown;
};

export async function getDealersPage(db: Db, q: DealersQuery): Promise<DealersPage> {
  const w = periodWindow(q.period);
  const dayStart = guardDayStart();
  const limit = AI_DAILY_TOKEN_LIMIT_PER_DEALER;
  const like = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const search = like
    ? Prisma.sql`AND (d."name" ILIKE ${like} OR d."businessName" ILIKE ${like} OR d."email" ILIKE ${like})`
    : Prisma.empty;
  const filter =
    q.filter === 'off'
      ? Prisma.sql`AND s."isEnabled" = false`
      : q.filter === 'auto_off'
        ? Prisma.sql`AND s."isEnabled" IS DISTINCT FROM false AND s."autoAnalyze" = false`
        : q.filter === 'near_limit'
          ? Prisma.sql`AND COALESCE(t.tokens, 0) >= ${Math.floor(limit * 0.8)}`
          : Prisma.empty;
  const order =
    q.sort === 'name'
      ? Prisma.sql`ORDER BY lower(COALESCE(d."businessName", d."name", '')) ASC, d."id"`
      : q.sort === 'failures'
        ? Prisma.sql`ORDER BY COALESCE(us.failures, 0) DESC, COALESCE(us.calls, 0) DESC, d."id"`
        : q.sort === 'today'
          ? Prisma.sql`ORDER BY COALESCE(t.tokens, 0) DESC, d."id"`
          : Prisma.sql`ORDER BY COALESCE(us.tokens, 0) DESC, COALESCE(us.calls, 0) DESC, d."id"`;

  const [rows, offCount, autoOffCount] = await Promise.all([
    db.$queryRaw<DealerRaw[]>(Prisma.sql`
      WITH us AS (
        SELECT u."dealerId", COUNT(*)::bigint AS calls,
               COUNT(*) FILTER (WHERE NOT u."success")::bigint AS failures,
               COALESCE(SUM(u."inputTokens" + u."outputTokens"), 0)::bigint AS tokens
          FROM "AIUsageLog" u
         WHERE u."dealerId" IS NOT NULL AND u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to}
         GROUP BY 1
      ), t AS (
        SELECT u."dealerId", COALESCE(SUM(u."inputTokens" + u."outputTokens"), 0)::bigint AS tokens
          FROM "AIUsageLog" u
         WHERE u."dealerId" IS NOT NULL AND u."createdAt" >= ${dayStart}
         GROUP BY 1
      )
      SELECT d."id", d."name", d."businessName" AS business, d."isDemo" AS is_demo,
             s."isEnabled" AS is_enabled, s."autoAnalyze" AS auto_analyze, (s."id" IS NOT NULL) AS has_settings,
             COALESCE(us.calls, 0) AS calls, COALESCE(us.failures, 0) AS failures, COALESCE(us.tokens, 0) AS tokens,
             COALESCE(t.tokens, 0) AS today,
             COUNT(*) OVER() AS total
        FROM "User" d
        LEFT JOIN "AISettings" s ON s."dealerId" = d."id"
        LEFT JOIN us ON us."dealerId" = d."id"
        LEFT JOIN t ON t."dealerId" = d."id"
       WHERE d."role" = 'DEALER'::"Role" ${search} ${filter}
       ${order}
       LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`),
    db.aISettings.count({ where: { isEnabled: false, dealer: { role: 'DEALER' } } }),
    db.aISettings.count({ where: { isEnabled: true, autoAnalyze: false, dealer: { role: 'DEALER' } } }),
  ]);

  const ids = rows.map((r) => r.id);
  const pendingRaw = ids.length
    ? await db.$queryRaw<Array<{ id: string; n: unknown }>>(Prisma.sql`
        SELECT q."dealerId" AS id, COUNT(*)::bigint AS n
          FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
         WHERE f."aiProcessedAt" IS NULL AND f."text" IS NOT NULL AND f."deletedAt" IS NULL
           AND f."createdAt" >= ${lookbackStart()} AND q."dealerId" = ANY(${ids}::text[])
         GROUP BY 1`)
    : [];
  const pending = new Map(pendingRaw.map((r) => [r.id, n(r.n)]));

  const items: DealerAiRow[] = rows.map((r) => {
    const today = n(r.today);
    return {
      id: r.id,
      name: r.business || r.name || 'Adsız bayi',
      isDemo: !!r.is_demo,
      aiEnabled: r.is_enabled !== false,
      autoAnalyze: r.auto_analyze !== false,
      source: r.has_settings ? 'settings' : 'default',
      calls: n(r.calls),
      failures: n(r.failures),
      tokens: n(r.tokens),
      todayTokens: today,
      todayPercent: limit > 0 ? Math.round((today / limit) * 1000) / 10 : 0,
      pending: pending.get(r.id) ?? 0,
    };
  });
  return { items, total: n(rows[0]?.total), page: q.page, size: q.size, dealerLimit: limit, counts: { off: offCount, autoOff: autoOffCount } };
}

/** Bayinin AI ana anahtarı / otomatik analiz ayarı — gerekçeli, denetimli, tek transaction. */
export async function setDealerAi(db: Db, patch: DealerAiPatch, actor: AuditActor, request?: Req) {
  const dealer = await db.user.findUnique({ where: { id: patch.dealerId }, select: { id: true, role: true } });
  if (!dealer || dealer.role !== 'DEALER') throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');
  const data: { isEnabled?: boolean; autoAnalyze?: boolean } = {};
  if (patch.aiEnabled !== undefined) data.isEnabled = patch.aiEnabled;
  if (patch.autoAnalyze !== undefined) data.autoAnalyze = patch.autoAnalyze;
  const saved = await db.$transaction(async (tx) => {
    const before = await tx.aISettings.findUnique({ where: { dealerId: patch.dealerId }, select: { isEnabled: true, autoAnalyze: true } });
    const after = await tx.aISettings.upsert({
      where: { dealerId: patch.dealerId },
      create: { dealerId: patch.dealerId, ...data },
      update: data,
      select: { isEnabled: true, autoAnalyze: true },
    });
    await tx.auditLog.create({
      data: auditEntry(
        actor,
        {
          action: 'ai_ops.dealer_ai.update',
          entity: 'AISettings',
          entityId: patch.dealerId,
          oldData: before ?? { isEnabled: true, autoAnalyze: true, _default: true },
          newData: { ...after, reason: patch.reason },
        },
        request
      ),
    });
    return after;
  });
  invalidateDealerAiPolicy(patch.dealerId);
  return { dealerId: patch.dealerId, aiEnabled: saved.isEnabled, autoAnalyze: saved.autoAnalyze };
}

// ───────────────────────────── Sinyaller ─────────────────────────────

/** Gerçek (sezgisel olmayan) AI sinyali koşulu. */
const REAL = Prisma.sql`f."aiModelUsed" IS DISTINCT FROM ${SYNTHETIC_MODEL}`;
const IN_WINDOW = (from: Date, to: Date) => Prisma.sql`f."deletedAt" IS NULL AND f."createdAt" >= ${from} AND f."createdAt" < ${to}`;

type HeadRaw = Record<string, unknown>;

async function signalHead(db: Db, from: Date, to: Date): Promise<HeadRaw> {
  const rows = await db.$queryRaw<HeadRaw[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE f."text" IS NOT NULL)::bigint AS with_text,
           COUNT(*) FILTER (WHERE f."aiProcessedAt" IS NOT NULL AND ${REAL})::bigint AS analyzed,
           COUNT(*) FILTER (WHERE f."aiModelUsed" = ${SYNTHETIC_MODEL})::bigint AS synthetic,
           COUNT(*) FILTER (WHERE f."aiProcessedAt" IS NULL AND f."text" IS NOT NULL)::bigint AS pending,
           COUNT(*) FILTER (WHERE ${REAL} AND f."urgency" >= ${URGENT_MIN})::bigint AS urgent,
           COUNT(*) FILTER (WHERE ${REAL} AND f."churnRisk" >= ${CHURN_HIGH_MIN})::bigint AS churn_high,
           COUNT(*) FILTER (WHERE f."isToxic" = true)::bigint AS toxic,
           COUNT(*) FILTER (WHERE ${REAL} AND f."sentiment" = 'negative')::bigint AS negative,
           AVG(f."urgency") FILTER (WHERE ${REAL}) AS avg_u,
           AVG(f."effortScore") FILTER (WHERE ${REAL}) AS avg_e,
           AVG(f."churnRisk") FILTER (WHERE ${REAL}) AS avg_c,
           AVG(f."rating") AS avg_r,
           COUNT(*) FILTER (WHERE ${REAL} AND f."urgency" IS NOT NULL)::bigint AS n_u
      FROM "Feedback" f
     WHERE ${IN_WINDOW(from, to)}`);
  return rows[0] ?? {};
}

function dist(raw: Array<{ k: string | null; c: unknown }>, order: readonly string[], label: (k: string) => string): Dist {
  const counts = new Map<string, number>();
  for (const r of raw) if (r.k) counts.set(r.k, (counts.get(r.k) ?? 0) + n(r.c));
  const keys = [...order, ...Array.from(counts.keys()).filter((k) => !order.includes(k))];
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  return keys.map((k) => ({ key: k, label: label(k), count: counts.get(k) ?? 0, percent: pct(counts.get(k) ?? 0, total) }));
}

const bucketCase = (col: Prisma.Sql, buckets: ReadonlyArray<{ key: string; min: number; max: number }>) =>
  Prisma.sql`CASE ${Prisma.join(
    buckets.filter((b) => Number.isFinite(b.max)).map((b) => Prisma.sql`WHEN ${col} < ${b.max} THEN ${b.key}`),
    ' '
  )} ELSE ${buckets[buckets.length - 1].key} END`;

const jsonArr = (col: Prisma.Sql) => Prisma.sql`jsonb_array_elements(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END)`;

export async function getSignalsReport(db: Db, period: AiOpsPeriod, opts: { fresh?: boolean; now?: Date } = {}): Promise<SignalsReport> {
  return cached(`ai-ops:signals:${period}`, !!opts.fresh, async () => {
    const w = periodWindow(period, opts.now);
    const win = IN_WINDOW(w.from, w.to);
    const [head, prevHead, sentimentRaw, intentRaw, urgencyRaw, churnRaw, ratingRaw, themesRaw, entitiesRaw, emotionsRaw, actionsRaw, dealersRaw, recentRows] =
      await Promise.all([
        signalHead(db, w.from, w.to),
        signalHead(db, w.prevFrom, w.prevTo),
        db.$queryRaw<Array<{ k: string | null; c: unknown }>>(Prisma.sql`
          SELECT f."sentiment" AS k, COUNT(*)::bigint AS c FROM "Feedback" f
           WHERE ${win} AND ${REAL} AND f."sentiment" IS NOT NULL GROUP BY 1`),
        db.$queryRaw<Array<{ k: string | null; c: unknown }>>(Prisma.sql`
          SELECT f."intent" AS k, COUNT(*)::bigint AS c FROM "Feedback" f
           WHERE ${win} AND ${REAL} AND f."intent" IS NOT NULL GROUP BY 1`),
        db.$queryRaw<Array<{ k: string | null; c: unknown }>>(Prisma.sql`
          SELECT ${bucketCase(Prisma.sql`f."urgency"`, URGENCY_BUCKETS)} AS k, COUNT(*)::bigint AS c FROM "Feedback" f
           WHERE ${win} AND ${REAL} AND f."urgency" IS NOT NULL GROUP BY 1`),
        db.$queryRaw<Array<{ k: string | null; c: unknown }>>(Prisma.sql`
          SELECT ${bucketCase(Prisma.sql`f."churnRisk"`, CHURN_BUCKETS)} AS k, COUNT(*)::bigint AS c FROM "Feedback" f
           WHERE ${win} AND ${REAL} AND f."churnRisk" IS NOT NULL GROUP BY 1`),
        db.$queryRaw<Array<{ r: number; c: unknown; pos: unknown; neu: unknown; neg: unknown }>>(Prisma.sql`
          SELECT f."rating" AS r, COUNT(*)::bigint AS c,
                 COUNT(*) FILTER (WHERE ${REAL} AND f."sentiment" = 'positive')::bigint AS pos,
                 COUNT(*) FILTER (WHERE ${REAL} AND f."sentiment" = 'neutral')::bigint AS neu,
                 COUNT(*) FILTER (WHERE ${REAL} AND f."sentiment" = 'negative')::bigint AS neg
            FROM "Feedback" f WHERE ${win} GROUP BY 1`),
        db.$queryRaw<Array<{ theme: string; c: unknown; pos: unknown; neg: unknown; avg_r: unknown; dealers: unknown }>>(Prisma.sql`
          SELECT left(t->>'theme', 120) AS theme, COUNT(*)::bigint AS c,
                 COUNT(*) FILTER (WHERE t->>'sentiment' = 'positive')::bigint AS pos,
                 COUNT(*) FILTER (WHERE t->>'sentiment' = 'negative')::bigint AS neg,
                 AVG(f."rating") AS avg_r, COUNT(DISTINCT q."dealerId")::bigint AS dealers
            FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
            CROSS JOIN LATERAL ${jsonArr(Prisma.sql`f."themes"`)} AS t
           WHERE ${win} AND ${REAL} AND jsonb_typeof(t) = 'object' AND COALESCE(t->>'theme', '') <> ''
           GROUP BY 1 ORDER BY c DESC LIMIT 12`),
        db.$queryRaw<Array<{ name: string; type: string | null; c: unknown; pos: unknown; neg: unknown }>>(Prisma.sql`
          SELECT left(e->>'name', 120) AS name, COALESCE(e->>'type', 'other') AS type, COUNT(*)::bigint AS c,
                 COUNT(*) FILTER (WHERE e->>'sentiment' = 'positive')::bigint AS pos,
                 COUNT(*) FILTER (WHERE e->>'sentiment' = 'negative')::bigint AS neg
            FROM "Feedback" f CROSS JOIN LATERAL ${jsonArr(Prisma.sql`f."entities"`)} AS e
           WHERE ${win} AND ${REAL} AND jsonb_typeof(e) = 'object' AND COALESCE(e->>'name', '') <> ''
           GROUP BY 1, 2 ORDER BY c DESC LIMIT 12`),
        db.$queryRaw<Array<{ k: string; c: unknown }>>(Prisma.sql`
          SELECT lower(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e->>'label' END) AS k, COUNT(*)::bigint AS c
            FROM "Feedback" f CROSS JOIN LATERAL ${jsonArr(Prisma.sql`f."emotions"`)} AS e
           WHERE ${win} AND ${REAL}
           GROUP BY 1 HAVING lower(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e->>'label' END) IS NOT NULL
           ORDER BY c DESC LIMIT 10`),
        db.$queryRaw<Array<{ category: string; c: unknown; dealers: unknown; prio: unknown; examples: string[] | null }>>(Prisma.sql`
          SELECT COALESCE(NULLIF(lower(a->>'category'), ''), 'other') AS category, COUNT(*)::bigint AS c,
                 COUNT(DISTINCT q."dealerId")::bigint AS dealers,
                 MAX(CASE lower(a->>'priority') WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END) AS prio,
                 (array_agg(DISTINCT left(a->>'action', 140)))[1:3] AS examples
            FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
            CROSS JOIN LATERAL ${jsonArr(Prisma.sql`f."actionSuggestions"`)} AS a
           WHERE ${win} AND ${REAL} AND jsonb_typeof(a) = 'object' AND COALESCE(a->>'action', '') <> ''
           GROUP BY 1 ORDER BY prio DESC, c DESC LIMIT 8`),
        db.$queryRaw<Array<{ id: string; name: string | null; business: string | null; c: unknown; neg: unknown; urg: unknown; churn: unknown; avg_r: unknown }>>(Prisma.sql`
          SELECT q."dealerId" AS id, d."name" AS name, d."businessName" AS business, COUNT(*)::bigint AS c,
                 COUNT(*) FILTER (WHERE ${REAL} AND f."sentiment" = 'negative')::bigint AS neg,
                 COUNT(*) FILTER (WHERE ${REAL} AND f."urgency" >= ${URGENT_MIN})::bigint AS urg,
                 COUNT(*) FILTER (WHERE ${REAL} AND f."churnRisk" >= ${CHURN_HIGH_MIN})::bigint AS churn,
                 AVG(f."rating") AS avg_r
            FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId" LEFT JOIN "User" d ON d."id" = q."dealerId"
           WHERE ${win}
           GROUP BY 1, 2, 3 HAVING COUNT(*) >= 3
           ORDER BY COUNT(*) FILTER (WHERE ${REAL} AND f."sentiment" = 'negative') DESC, c DESC
           LIMIT 200`),
        db.feedback.findMany({
          where: { deletedAt: null, aiProcessedAt: { not: null }, createdAt: { gte: w.from, lt: w.to } },
          orderBy: { aiProcessedAt: 'desc' },
          take: 12,
          select: {
            id: true,
            aiProcessedAt: true,
            rating: true,
            sentiment: true,
            intent: true,
            urgency: true,
            aiModelUsed: true,
            text: true,
            qrCode: { select: { dealer: { select: { name: true, businessName: true } } } },
          },
        }),
      ]);

    const total = n(head.total);
    const analyzed = n(head.analyzed);
    const ratingMap = new Map(ratingRaw.map((r) => [Number(r.r), r]));
    const riskyDealers = dealersRaw
      .map((r) => {
        const feedbacks = n(r.c);
        const avg = nOrNull(r.avg_r);
        const row = { feedbacks, negative: n(r.neg), urgent: n(r.urg), churnHigh: n(r.churn), avgRating: avg };
        return {
          dealerId: r.id,
          name: r.business || r.name || 'Adsız bayi',
          feedbacks,
          negativePercent: pct(row.negative, feedbacks),
          urgent: row.urgent,
          churnHigh: row.churnHigh,
          avgRating: round(avg, 2),
          risk: dealerRiskScore(row),
        };
      })
      .filter((r) => r.risk > 0)
      .sort((a, b) => b.risk - a.risk || b.feedbacks - a.feedbacks)
      .slice(0, 10);

    const report: SignalsReport = {
      period,
      generatedAt: new Date().toISOString(),
      coverage: {
        total,
        withText: n(head.with_text),
        analyzed,
        synthetic: n(head.synthetic),
        pending: n(head.pending),
        analyzedPercent: pct(analyzed, n(head.with_text)),
      },
      attention: {
        urgent: n(head.urgent),
        churnHigh: n(head.churn_high),
        toxic: n(head.toxic),
        negative: n(head.negative),
        prev: { urgent: n(prevHead.urgent), churnHigh: n(prevHead.churn_high), toxic: n(prevHead.toxic), negative: n(prevHead.negative) },
      },
      averages: {
        urgency: round(nOrNull(head.avg_u) == null ? null : nOrNull(head.avg_u)! * 100, 1),
        effort: round(nOrNull(head.avg_e) == null ? null : nOrNull(head.avg_e)! * 100, 1),
        churn: round(nOrNull(head.avg_c) == null ? null : nOrNull(head.avg_c)! * 100, 1),
        rating: round(nOrNull(head.avg_r), 2),
        n: n(head.n_u),
      },
      sentiment: dist(sentimentRaw, ['positive', 'neutral', 'negative'], (k) => SENTIMENT_LABEL[k] ?? k),
      intent: dist(intentRaw, ['complaint', 'suggestion', 'praise', 'question', 'general'], (k) => INTENT_LABEL[k] ?? k),
      urgency: dist(urgencyRaw, URGENCY_BUCKETS.map((b) => b.key), (k) => URGENCY_BUCKETS.find((b) => b.key === k)?.label ?? k),
      churn: dist(churnRaw, CHURN_BUCKETS.map((b) => b.key), (k) => CHURN_BUCKETS.find((b) => b.key === k)?.label ?? k),
      rating: [1, 2, 3, 4, 5].map((r) => {
        const x = ratingMap.get(r);
        return { rating: r, count: n(x?.c), positive: n(x?.pos), neutral: n(x?.neu), negative: n(x?.neg) };
      }),
      themes: themesRaw.map((t) => ({
        theme: t.theme,
        count: n(t.c),
        positive: pct(n(t.pos), n(t.c)),
        negative: pct(n(t.neg), n(t.c)),
        avgRating: round(nOrNull(t.avg_r), 2),
        dealers: n(t.dealers),
      })),
      entities: entitiesRaw.map((e) => ({ name: e.name, type: e.type ?? 'other', count: n(e.c), positive: pct(n(e.pos), n(e.c)), negative: pct(n(e.neg), n(e.c)) })),
      emotions: emotionsRaw.filter((e) => !!e.k).map((e) => ({ emotion: e.k, label: EMOTION_LABEL[e.k] ?? e.k, count: n(e.c) })),
      actions: actionsRaw.map((a) => ({
        category: a.category,
        count: n(a.c),
        dealers: n(a.dealers),
        topPriority: (['', 'low', 'medium', 'high', 'critical'] as const)[Math.max(0, Math.min(4, n(a.prio)))] || 'medium',
        examples: (a.examples ?? []).filter(Boolean),
      })),
      riskyDealers,
      recent: recentRows.map((r) => ({
        id: r.id,
        at: (r.aiProcessedAt ?? new Date()).toISOString(),
        dealerName: r.qrCode.dealer?.businessName || r.qrCode.dealer?.name || 'Adsız bayi',
        rating: r.rating,
        sentiment: r.sentiment,
        intent: r.intent,
        urgency: r.urgency,
        model: r.aiModelUsed,
        kind: modelKind(r.aiModelUsed),
        preview: preview(r.text, 180),
      })),
    };
    return report;
  });
}

const realWhere = (): Prisma.FeedbackWhereInput => ({ OR: [{ aiModelUsed: null }, { aiModelUsed: { not: SYNTHETIC_MODEL } }] });

export function signalWhere(q: SignalFeedbacksQuery, w: PeriodWindow): Prisma.FeedbackWhereInput {
  const base: Prisma.FeedbackWhereInput = {
    deletedAt: null,
    createdAt: { gte: w.from, lt: w.to },
    ...(q.dealerId ? { qrCode: { dealerId: q.dealerId } } : {}),
  };
  const v = q.value ?? '';
  switch (q.signal) {
    case 'urgent':
      return { ...base, ...realWhere(), urgency: { gte: URGENT_MIN } };
    case 'churn':
      return { ...base, ...realWhere(), churnRisk: { gte: CHURN_HIGH_MIN } };
    case 'toxic':
      return { ...base, isToxic: true };
    case 'negative':
      return { ...base, ...realWhere(), sentiment: 'negative' };
    case 'intent':
      return { ...base, ...realWhere(), intent: v };
    case 'theme':
      return { ...base, ...realWhere(), themes: { array_contains: [{ theme: v }] } };
    case 'entity':
      return { ...base, ...realWhere(), entities: { array_contains: [{ name: v }] } };
    case 'urgency': {
      const b = URGENCY_BUCKETS.find((x) => x.key === v);
      if (!b) throw new ApiError('VALIDATION', 'Bilinmeyen aciliyet kovası.');
      return { ...base, ...realWhere(), urgency: Number.isFinite(b.max) ? { gte: b.min, lt: b.max } : { gte: b.min } };
    }
    case 'rating': {
      const r = Number(v);
      if (!Number.isInteger(r) || r < 1 || r > 5) throw new ApiError('VALIDATION', 'Puan 1-5 arasında olmalı.');
      return { ...base, rating: r };
    }
  }
}

export async function getSignalFeedbacks(db: Db, q: SignalFeedbacksQuery): Promise<SignalFeedbacksPage> {
  const w = periodWindow(q.period);
  const where = signalWhere(q, w);
  const [total, rows] = await Promise.all([
    db.feedback.count({ where }),
    db.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.size,
      take: q.size,
      select: {
        id: true,
        createdAt: true,
        rating: true,
        sentiment: true,
        intent: true,
        urgency: true,
        churnRisk: true,
        isToxic: true,
        aiModelUsed: true,
        text: true,
        qrCode: { select: { dealerId: true, dealer: { select: { name: true, businessName: true } } } },
      },
    }),
  ]);
  return {
    title: signalTitle(q.signal, q.value),
    items: rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      dealerId: r.qrCode.dealerId,
      dealerName: r.qrCode.dealer?.businessName || r.qrCode.dealer?.name || 'Adsız bayi',
      rating: r.rating,
      sentiment: r.sentiment,
      intent: r.intent,
      urgency: r.urgency,
      churnRisk: r.churnRisk,
      isToxic: r.isToxic,
      kind: modelKind(r.aiModelUsed),
      preview: preview(r.text, 220),
    })),
    total,
    page: q.page,
    size: q.size,
  };
}

// ───────────────────────────── Asistan ─────────────────────────────

/** Asistan bağlamı: dönem toplamları + bayi sıralaması (B6: bayi sorusu artık cevaplanabilir). */
export async function buildAssistantContext(db: Db, period: AiOpsPeriod): Promise<{ ctx: AskAIContext; sources: string[] }> {
  const w = periodWindow(period);
  const [signals, recent] = await Promise.all([
    getSignalsReport(db, period),
    db.feedback.findMany({
      where: { deletedAt: null, text: { not: null }, createdAt: { gte: w.from, lt: w.to } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { text: true, rating: true, sentiment: true, createdAt: true },
    }),
  ]);
  const share = (key: string) => signals.sentiment.find((s) => s.key === key)?.percent ?? 0;
  const ctx: AskAIContext = {
    totalFeedbacks: signals.coverage.total,
    avgRating: signals.averages.rating ?? 0,
    sentimentDist: { positive: share('positive'), neutral: share('neutral'), negative: share('negative') },
    topTopics: signals.themes.map((t) => ({ topic: t.theme, count: t.count })),
    recentFeedbacks: recent.map((f) => ({ text: f.text ?? '', rating: f.rating, sentiment: f.sentiment ?? 'neutral', createdAt: f.createdAt.toISOString() })),
    intentDist: Object.fromEntries(signals.intent.filter((i) => i.count > 0).map((i) => [i.key, i.count])),
    urgencyChurnSummary: { highUrgencyCount: signals.attention.urgent, highChurnCount: signals.attention.churnHigh },
    dealerRanking: signals.riskyDealers.map((d) => ({
      name: d.name,
      feedbacks: d.feedbacks,
      negativePercent: d.negativePercent,
      urgent: d.urgent,
      churnHigh: d.churnHigh,
      avgRating: d.avgRating,
    })),
  };
  const sources = [
    `${signals.coverage.total} geri bildirim (${periodLabelLower(period)})`,
    `${signals.riskyDealers.length} bayilik risk sıralaması`,
    `${signals.themes.length} tema`,
    `son ${recent.length} yorum`,
  ];
  return { ctx, sources };
}

function periodLabelLower(p: AiOpsPeriod): string {
  return { '24h': 'son 24 saat', '7d': 'son 7 gün', '30d': 'son 30 gün', '90d': 'son 90 gün' }[p];
}

export async function askAssistant(db: Db, input: AssistantInput, actorKey: string): Promise<AssistantAnswer> {
  const { ctx, sources } = await buildAssistantContext(db, input.period);
  ctx.previousMessages = input.history.slice(-12);
  const answer = await askAI(input.question, ctx, { actorKey });
  if (isAskAiFailure(answer)) {
    const msg = answer?.trim() || 'Asistan yanıt üretemedi. Lütfen tekrar deneyin.';
    const limited = /limit|kota|sık/i.test(msg);
    throw new ApiError(limited ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE', msg, { retryable: true });
  }
  return { answer: answer!.trim(), period: input.period, sources, generatedAt: new Date().toISOString() };
}
