/**
 * Kriz radarı — ölçüm (salt okuma) ve vaka üretimi (yalnız arka plan / açık POST).
 *
 * Kapanan denetim bulguları (dealer_incidents.md):
 *  - 3: tespit GET'in yan etkisiydi → artık üç tetikleyici var, hiçbiri okuma yolu değil:
 *       (a) olay güdümlü: yorum analizi bitince (`lib/inngest/feedback-analyze-pipeline.ts`),
 *       (b) günlük bakım işi (`/api/cron/inbox-queues`, günlük orkestratörden),
 *       (c) bayinin "Şimdi tara" düğmesi (POST, hız sınırlı).
 *     Tekillik: bayi+tür başına advisory kilit + "açık vaka varsa açma" (yaş sınırı yok, eski
 *     7 günlük kopya üretimi biter) + çözümden sonra 24 saat yeniden açmama süresi.
 *  - 10: yeni vaka bayiye uygulama içi bildirim (`ctaPath` ile vakaya derin link), yüksek
 *       önemde web push ve `incident.created` webhook'u üretir.
 *  - 11: 14 günlük tüm yorumları belleğe çeken sorgu yerine SQL toplamları (`aggregate`/`count`).
 *  - Eşikler bayi ayarından (Otomasyon → Uyarılar) okunur; yoksa sunucu varsayılanı.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson, redisSetJson } from '@/lib/redis';
import { sendPush } from '@/lib/push';
import { dispatchWebhookEvent } from '@/lib/webhook-dispatch';
import {
  DEFAULT_RADAR_RULES,
  RADAR_INCIDENT_TYPE,
  RADAR_REOPEN_COOLDOWN_MS,
  evaluateRadar,
  parseRadarRules,
  radarIncidentSeverity,
  radarRulesSettingsKey,
  type RadarRuleEval,
  type RadarRuleKey,
  type RadarRules,
  type RadarStats,
} from './radar-rules';
import { OPEN_INCIDENT_STATUSES, defaultDueAt } from './incident-catalog';
import { DAY_MS, HOUR_MS } from './time';
import { SYSTEM_ACTOR, writeQueueAudit } from './audit';
import { runAfter } from './after';
import type { RadarStatus } from './types';

export async function getRadarRules(dealerId: string): Promise<RadarRules> {
  try {
    const row = await prisma.settings.findUnique({ where: { key: radarRulesSettingsKey(dealerId) }, select: { value: true } });
    return parseRadarRules(row?.value);
  } catch (err) {
    console.error('[radar] eşik ayarı okunamadı, varsayılan kullanılıyor:', err);
    return DEFAULT_RADAR_RULES;
  }
}

const NEGATIVE_FB: Prisma.FeedbackWhereInput = { OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }] };
const NEGATIVE_CR: Prisma.ConsumptionReviewWhereInput = { OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }] };

function weightedAvg(a: { avg: number | null; n: number }, b: { avg: number | null; n: number }): number | null {
  const n = a.n + b.n;
  if (n === 0) return null;
  return ((a.avg ?? 0) * a.n + (b.avg ?? 0) * b.n) / n;
}

/** Radar ölçümleri — QR geri bildirimi + tüketim yorumu birlikte (SQL toplamları). */
export async function computeRadarStats(dealerId: string, rules: RadarRules, now: Date = new Date()): Promise<RadarStats> {
  const t = now.getTime();
  const last7Start = new Date(t - 7 * DAY_MS);
  const prev7Start = new Date(t - 14 * DAY_MS);
  const windowStart = new Date(t - rules.complaintSpike.windowHours * HOUR_MS);
  const dayStart = new Date(t - DAY_MS);
  const slaCut = new Date(t - rules.unansweredNegative.slaHours * HOUR_MS);
  const lookback = new Date(t - 30 * DAY_MS);

  const fb: Prisma.FeedbackWhereInput = { deletedAt: null, qrCode: { dealerId } };
  const cr: Prisma.ConsumptionReviewWhereInput = { deletedAt: null, consumption: { dealerId } };

  const [fbLast, fbPrev, crLast, crPrev, fbNeg, crNeg, urgent, toxic, fbUnanswered, crUnanswered] = await Promise.all([
    prisma.feedback.aggregate({ where: { ...fb, createdAt: { gte: last7Start } }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.feedback.aggregate({
      where: { ...fb, createdAt: { gte: prev7Start, lt: last7Start } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.consumptionReview.aggregate({ where: { ...cr, createdAt: { gte: last7Start } }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.consumptionReview.aggregate({
      where: { ...cr, createdAt: { gte: prev7Start, lt: last7Start } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.feedback.count({ where: { ...fb, createdAt: { gte: windowStart }, ...NEGATIVE_FB } }),
    prisma.consumptionReview.count({ where: { ...cr, createdAt: { gte: windowStart }, ...NEGATIVE_CR } }),
    prisma.feedback.count({
      where: { ...fb, createdAt: { gte: dayStart }, OR: [{ isToxic: true }, { urgency: { gte: rules.urgentToxic.minUrgency } }] },
    }),
    prisma.feedback.count({ where: { ...fb, createdAt: { gte: dayStart }, isToxic: true } }),
    prisma.feedback.count({ where: { ...fb, dealerRepliedAt: null, createdAt: { gte: lookback, lte: slaCut }, ...NEGATIVE_FB } }),
    prisma.consumptionReview.count({
      where: { ...cr, dealerRepliedAt: null, createdAt: { gte: lookback, lte: slaCut }, ...NEGATIVE_CR },
    }),
  ]);

  const last = { avg: fbLast._avg.rating, n: fbLast._count._all };
  const lastCr = { avg: crLast._avg.rating, n: crLast._count._all };
  const prev = { avg: fbPrev._avg.rating, n: fbPrev._count._all };
  const prevCr = { avg: crPrev._avg.rating, n: crPrev._count._all };

  return {
    avgLast7: weightedAvg(last, lastCr),
    countLast7: last.n + lastCr.n,
    avgPrev7: weightedAvg(prev, prevCr),
    countPrev7: prev.n + prevCr.n,
    negativesInWindow: fbNeg + crNeg,
    urgentOrToxic24h: urgent,
    toxic24h: toxic,
    unansweredNegative: fbUnanswered + crUnanswered,
  };
}

const LAST_SCAN_KEY = (dealerId: string) => `incident_radar_scan:${dealerId}`;

async function readLastScan(dealerId: string): Promise<string | null> {
  try {
    const row = await prisma.settings.findUnique({ where: { key: LAST_SCAN_KEY(dealerId) }, select: { value: true } });
    const v = row?.value as { at?: unknown } | null | undefined;
    return v && typeof v.at === 'string' ? v.at : null;
  } catch {
    return null;
  }
}

async function evaluateNow(dealerId: string, now: Date): Promise<{ status: RadarStatus; rules: RadarRules; stats: RadarStats }> {
  const rules = await getRadarRules(dealerId);
  const [stats, lastScanAt] = await Promise.all([computeRadarStats(dealerId, rules, now), readLastScan(dealerId)]);
  const ev = evaluateRadar(stats, rules);
  return {
    rules,
    stats,
    status: { level: ev.level, rules: ev.rules, evaluatedAt: now.toISOString(), lastScanAt },
  };
}

/** Radar durumu (salt okuma; 60 sn önbellek). Vaka ÜRETMEZ. */
const RADAR_CACHE_KEY = (dealerId: string) => `dealer:radar:${dealerId}`;
const RADAR_CACHE_TTL = 60;

export async function getRadarStatus(dealerId: string, opts: { fresh?: boolean } = {}): Promise<RadarStatus> {
  if (opts.fresh) {
    const status = (await evaluateNow(dealerId, new Date())).status;
    await redisSetJson(RADAR_CACHE_KEY(dealerId), status, RADAR_CACHE_TTL);
    return status;
  }
  return cachedJson(RADAR_CACHE_KEY(dealerId), RADAR_CACHE_TTL, async () => (await evaluateNow(dealerId, new Date())).status);
}

/* ───────────────────────── Vaka üretimi ───────────────────────── */

const TITLES: Record<string, string> = {
  rating_drop: 'Ortalama puan düştü',
  complaint_spike: 'Olumsuz yorumlar arttı',
  negative_spike: 'Acil ya da uygunsuz yorum geldi',
};

function fmt1(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function describe(key: Exclude<RadarRuleKey, 'unanswered_negative'>, e: RadarRuleEval, rules: RadarRules): string {
  if (key === 'rating_drop') {
    return `Son 7 günün ortalaması ${fmt1(e.detail.avgLast7)}, önceki 7 gün ${fmt1(e.detail.avgPrev7)}. Düşüş ${fmt1(e.value)} puan (eşik ${fmt1(e.threshold)}).`;
  }
  if (key === 'complaint_spike') {
    return `Son ${rules.complaintSpike.windowHours} saatte ${e.value ?? 0} olumsuz yorum (eşik ${e.threshold}).`;
  }
  const toxic = e.detail.toxic ?? 0;
  return `Son 24 saatte ${e.value ?? 0} acil ya da uygunsuz yorum${toxic ? ` (${toxic} uygunsuz içerik)` : ''}.`;
}

async function evidenceFeedbackIds(
  dealerId: string,
  key: Exclude<RadarRuleKey, 'unanswered_negative'>,
  rules: RadarRules,
  now: Date
): Promise<string[]> {
  const t = now.getTime();
  const base: Prisma.FeedbackWhereInput = { deletedAt: null, qrCode: { dealerId } };
  let where: Prisma.FeedbackWhereInput;
  if (key === 'rating_drop') where = { ...base, createdAt: { gte: new Date(t - 7 * DAY_MS) }, rating: { lte: 3 } };
  else if (key === 'complaint_spike') where = { ...base, createdAt: { gte: new Date(t - rules.complaintSpike.windowHours * HOUR_MS) }, ...NEGATIVE_FB };
  else where = { ...base, createdAt: { gte: new Date(t - DAY_MS) }, OR: [{ isToxic: true }, { urgency: { gte: rules.urgentToxic.minUrgency } }] };
  const rows = await prisma.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true } });
  return rows.map((r) => r.id);
}

export interface RadarRunResult {
  dealerId: string;
  level: RadarStatus['level'];
  created: Array<{ id: string; type: string; severity: string }>;
  skipped: Array<{ type: string; reason: 'open_exists' | 'cooldown' }>;
}

const ALERT_KEYS: Array<Exclude<RadarRuleKey, 'unanswered_negative'>> = ['rating_drop', 'complaint_spike', 'urgent_toxic'];

/**
 * Bir bayi için radarı değerlendirir ve eşik aşan kurallar için (tekil) sistem vakası açar.
 * İdempotent: aynı türde açık vaka varken ya da çözümden sonraki 24 saatte yeni vaka açmaz.
 */
export async function runIncidentRadarForDealer(
  dealerId: string,
  opts: { trigger: 'event' | 'cron' | 'manual'; now?: Date } = { trigger: 'cron' }
): Promise<RadarRunResult> {
  const now = opts.now ?? new Date();
  const { status, rules } = await evaluateNow(dealerId, now);
  const result: RadarRunResult = { dealerId, level: status.level, created: [], skipped: [] };

  for (const key of ALERT_KEYS) {
    const e = status.rules.find((r) => r.key === key);
    if (!e || !e.enabled || e.level !== 'alert') continue;
    const type = RADAR_INCIDENT_TYPE[key];
    const severity = radarIncidentSeverity(key, e, Number(e.detail.toxic ?? 0));
    const feedbackIds = await evidenceFeedbackIds(dealerId, key, rules, now);

    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`radar:${dealerId}:${type}`}))`;
      const open = await tx.incident.findFirst({
        where: { dealerId, type, status: { in: [...OPEN_INCIDENT_STATUSES] } },
        select: { id: true },
      });
      if (open) return { skipped: 'open_exists' as const };
      const recent = await tx.incident.findFirst({
        where: { dealerId, type, status: 'resolved', resolvedAt: { gte: new Date(now.getTime() - RADAR_REOPEN_COOLDOWN_MS) } },
        select: { id: true },
      });
      if (recent) return { skipped: 'cooldown' as const };

      const incident = await tx.incident.create({
        data: {
          dealerId,
          type,
          severity,
          status: 'open',
          title: TITLES[type] ?? 'Radar uyarısı',
          description: describe(key, e, rules),
          thresholdValue: e.threshold,
          dueAt: defaultDueAt(severity, now),
          metadata: {
            source: 'radar',
            rule: key,
            trigger: opts.trigger,
            dedupeKey: `radar:${type}`,
            metrics: { value: e.value, threshold: e.threshold, ...e.detail },
            feedbackIds,
          } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await writeQueueAudit(tx, SYSTEM_ACTOR, [
        { action: 'incident.created', entity: 'Incident', entityId: incident.id, data: { source: 'radar', rule: key, trigger: opts.trigger } },
      ]);
      return { created: incident.id };
    });

    if ('created' in outcome && outcome.created) {
      result.created.push({ id: outcome.created, type, severity });
    } else if ('skipped' in outcome && outcome.skipped) {
      result.skipped.push({ type, reason: outcome.skipped });
    }
  }

  try {
    await prisma.settings.upsert({
      where: { key: LAST_SCAN_KEY(dealerId) },
      create: { key: LAST_SCAN_KEY(dealerId), value: { at: now.toISOString(), trigger: opts.trigger }, category: 'dealer_alerts' },
      update: { value: { at: now.toISOString(), trigger: opts.trigger } },
    });
  } catch (err) {
    console.error('[radar] son tarama zamanı yazılamadı:', err);
  }

  if (result.created.length > 0) await announceIncidents(dealerId, result.created);
  return result;
}

/** Yeni sistem vakaları: bayiye bildirim (+ yüksek önemde push) ve webhook. */
async function announceIncidents(dealerId: string, created: RadarRunResult['created']): Promise<void> {
  const top = created.reduce((a, b) => (rank(b.severity) < rank(a.severity) ? b : a));
  const title = created.length === 1 ? (TITLES[top.type] ?? 'Radar uyarısı') : `Kriz radarı ${created.length} uyarı verdi`;
  const ctaPath = `/dealer/inbox/incidents?id=${top.id}`;
  const message =
    created.length === 1
      ? 'Gelen Kutusu → Vakalar\'da ayrıntıları görün, sorumlu atayın.'
      : 'Gelen Kutusu → Vakalar\'da yeni vakaları inceleyin.';
  await prisma.notification.create({
    data: {
      userId: dealerId,
      title,
      message,
      type: top.severity === 'high' || top.severity === 'critical' ? 'warning' : 'info',
      data: { type: 'incident', module: 'incidents', ctaPath, incidentId: top.id },
    },
  });
  if (top.severity === 'high' || top.severity === 'critical') {
    runAfter('radar push', () => sendPush(dealerId, { title, body: message, url: ctaPath, kind: 'radar_incident' }));
  }
  runAfter('incident.created webhook', () =>
    Promise.all(
      created.map((c) =>
        dispatchWebhookEvent('incident.created', { incidentId: c.id, dealerId, type: c.type, severity: c.severity, source: 'radar' })
      )
    )
  );
}

function rank(severity: string): number {
  return ['critical', 'high', 'medium', 'low'].indexOf(severity);
}
