/**
 * Komuta Merkezi sunucu yükleyicileri — sayfa (SSR) ve BFF (`/api/admin/command-center`)
 * AYNI fonksiyonları çağırır.
 *
 * Kapanan denetim bulguları (docs/audit/2026-10-08/admin/admin*.md):
 *  - Tek pencere + tek tanım: geri bildirim = QR geri bildirimi + tüketim yorumu, ikisi de
 *    `deletedAt IS NULL` (admin B3, B9); kovalar İstanbul saatinde (platform-pulse B3).
 *  - Gerçek "en iyi bayiler": sıralama SQL'de, pencere içinde (admin B2).
 *  - 30 sorgu → bölüm başına 1-3 sorgu; bölüm başına Redis önbelleği (platform-pulse B7).
 *  - Sağlık: DB + Redis + cron + AI + posta; okunamayan kontrol "bilinmiyor",
 *    asla sessizce yeşil değil (admin B5/B6).
 *  - Bölümler `Promise.allSettled` ile bağımsız: biri düşerse yalnız o bölüm hata gösterir.
 * GET yan etkisizdir, LLM çağırmaz.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson, isRedisConfigured } from '@/lib/redis';
import { getMailDeliverySummary } from '@/lib/mail-sender';
import { loadCronState } from '@/lib/cron-state';
import { OPEN_DSR_STATUSES, DSR_LEGAL_DAYS } from '@/lib/dsr-workflow';
import type { MetricValue } from '@/components/ds/data/metric-format';
import {
  RANGE_COMPARE_LABEL,
  actionVerb,
  actorKindOf,
  aiHealth,
  cronHealth,
  dbStatus,
  entityLabel,
  fillSeries,
  overallHealth,
  pctChange,
  queueTone,
  ratioPct,
  resolveWindow,
  sum,
  type CronSnapshot,
} from './core';
import type {
  CommandEvent,
  CommandEventsPage,
  CommandOverview,
  CommandRange,
  EcosystemSection,
  EventActor,
  HealthCheck,
  HealthSection,
  KpiEntry,
  KpiSection,
  QueueGroup,
  QueueSection,
  SectionResult,
  TopDealersSection,
} from './types';

type Win = ReturnType<typeof resolveWindow>;

const CACHE_PREFIX = 'admin:cc:v1';
const LOCAL_TS = (col: Prisma.Sql) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')`;
const UNIT_SQL = { hour: Prisma.raw(`'hour'`), day: Prisma.raw(`'day'`) } as const;
const KEY_FMT = Prisma.raw(`'YYYY-MM-DD"T"HH24'`);

const num = (v: unknown): number => {
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Önbellekli hesap; `fresh` okumayı atlar ama sonucu yine yazar. */
async function cached<T>(key: string, ttl: number, fresh: boolean, fn: () => Promise<T>): Promise<{ data: T; generatedAt: string }> {
  if (!fresh) {
    const hit = await redisGetJson<{ data: T; generatedAt: string }>(key);
    if (hit && hit.generatedAt) return hit;
  }
  const value = { data: await fn(), generatedAt: new Date().toISOString() };
  await redisSetJson(key, value, ttl);
  return value;
}

function settle<T>(r: PromiseSettledResult<{ data: T; generatedAt: string }>, label: string): SectionResult<T> {
  if (r.status === 'fulfilled') return { ok: true, data: r.value.data, generatedAt: r.value.generatedAt };
  console.error(`[admin-command] ${label} yüklenemedi`, r.reason);
  return { ok: false, error: `${label} şu an yüklenemedi.`, retryable: true };
}

// ───────────────────────────── KPI + nabız ─────────────────────────────

type EvRow = { src: string; key: string; n: unknown; pos: unknown; rated: unknown };
type PtRow = { key: string; minted: unknown; spent: unknown };
type DlRow = { key: string; n: unknown };

export async function computeKpis(w: Win): Promise<KpiSection> {
  const unit = UNIT_SQL[w.unit];
  const ps = w.prevStartDate;
  const st = w.startDate;
  const en = w.endDate;
  const bucket = (col: Prisma.Sql) =>
    Prisma.sql`CASE WHEN ${col} >= ${st} THEN to_char(date_trunc(${unit}, ${LOCAL_TS(col)}), ${KEY_FMT}) ELSE 'prev' END`;

  const [evRows, ptRows, dlRows] = await Promise.all([
    prisma.$queryRaw<EvRow[]>(Prisma.sql`
      WITH ev AS (
        SELECT 'feedback'::text AS src, "createdAt" AS ts, "rating" AS rating FROM "Feedback"
         WHERE "deletedAt" IS NULL AND "createdAt" >= ${ps} AND "createdAt" <= ${en}
        UNION ALL
        SELECT 'feedback', "createdAt", "rating" FROM "ConsumptionReview"
         WHERE "deletedAt" IS NULL AND "createdAt" >= ${ps} AND "createdAt" <= ${en}
        UNION ALL
        SELECT 'consumption', "createdAt", NULL::int FROM "Consumption"
         WHERE "createdAt" >= ${ps} AND "createdAt" <= ${en}
        UNION ALL
        SELECT 'user', "createdAt", NULL::int FROM "User"
         WHERE "createdAt" >= ${ps} AND "createdAt" <= ${en}
      )
      SELECT src, ${bucket(Prisma.sql`ts`)} AS key,
             COUNT(*)::bigint AS n,
             COUNT(*) FILTER (WHERE rating >= 4)::bigint AS pos,
             COUNT(*) FILTER (WHERE rating IS NOT NULL)::bigint AS rated
        FROM ev GROUP BY 1, 2
    `),
    prisma.$queryRaw<PtRow[]>(Prisma.sql`
      SELECT ${bucket(Prisma.sql`"createdAt"`)} AS key,
             COALESCE(SUM("delta") FILTER (WHERE "delta" > 0), 0)::bigint AS minted,
             COALESCE(-SUM("delta") FILTER (WHERE "delta" < 0), 0)::bigint AS spent
        FROM "PointsLedger"
       WHERE "status" = 'posted' AND "currency" = 'POINTS'
         AND "source" NOT IN ('reversal', 'opening_balance')
         AND "createdAt" >= ${ps} AND "createdAt" <= ${en}
       GROUP BY 1
    `),
    prisma.$queryRaw<DlRow[]>(Prisma.sql`
      WITH a AS (
        SELECT "dealerId" AS d, "createdAt" AS ts FROM "Consumption"
         WHERE "createdAt" >= ${ps} AND "createdAt" <= ${en}
        UNION ALL
        SELECT q."dealerId", f."createdAt" FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
         WHERE f."deletedAt" IS NULL AND f."createdAt" >= ${ps} AND f."createdAt" <= ${en}
      )
      SELECT k AS key, COUNT(DISTINCT d)::bigint AS n
        FROM (SELECT d, ${bucket(Prisma.sql`ts`)} AS k FROM a WHERE ts >= ${st}) b GROUP BY k
      UNION ALL SELECT 'cur_total', COUNT(DISTINCT d)::bigint FROM a WHERE ts >= ${st}
      UNION ALL SELECT 'prev_total', COUNT(DISTINCT d)::bigint FROM a WHERE ts < ${st}
    `),
  ]);

  const series = (src: string) =>
    fillSeries(w.keys, evRows.filter((r) => r.src === src && r.key !== 'prev').map((r) => ({ key: r.key, n: num(r.n) })));
  const prevOf = (src: string, field: 'n' | 'pos' | 'rated' = 'n') =>
    sum(evRows.filter((r) => r.src === src && r.key === 'prev').map((r) => num(r[field])));
  const curOf = (src: string, field: 'pos' | 'rated') =>
    sum(evRows.filter((r) => r.src === src && r.key !== 'prev').map((r) => num(r[field])));

  const feedback = series('feedback');
  const consumptions = series('consumption');
  const newUsers = series('user');
  const label = RANGE_COMPARE_LABEL[w.range];
  const asOf = w.end;

  const countMetric = (s: number[], prev: number): MetricValue => {
    const value = sum(s);
    const d = pctChange(value, prev);
    return { value, format: 'number', series: s, asOf, delta: d == null ? null : { value: d, kind: 'percent', goodDirection: 'up', label } };
  };

  // CSAT: 4-5 yıldız oranı (QR + tüketim yorumu birleşik); değişim yüzde puanı.
  const posCur = curOf('feedback', 'pos');
  const ratedCur = curOf('feedback', 'rated');
  const csat = ratioPct(posCur, ratedCur);
  const csatPrev = ratioPct(prevOf('feedback', 'pos'), prevOf('feedback', 'rated'));
  const csatSeries = w.keys.map((k) => {
    const rows = evRows.filter((r) => r.src === 'feedback' && r.key === k);
    return ratioPct(sum(rows.map((r) => num(r.pos))), sum(rows.map((r) => num(r.rated))));
  });

  const minted = fillSeries(w.keys, ptRows.filter((r) => r.key !== 'prev').map((r) => ({ key: r.key, n: num(r.minted) })));
  const spentCur = sum(ptRows.filter((r) => r.key !== 'prev').map((r) => num(r.spent)));
  const mintedPrev = sum(ptRows.filter((r) => r.key === 'prev').map((r) => num(r.minted)));

  const dealerSeries = fillSeries(
    w.keys,
    dlRows.filter((r) => r.key !== 'cur_total' && r.key !== 'prev_total').map((r) => ({ key: r.key, n: num(r.n) }))
  );
  const dealersCur = num(dlRows.find((r) => r.key === 'cur_total')?.n);
  const dealersPrev = num(dlRows.find((r) => r.key === 'prev_total')?.n);
  const dealersDelta = pctChange(dealersCur, dealersPrev);

  const kpis: KpiEntry[] = [
    { key: 'newUsers', metric: countMetric(newUsers, prevOf('user')) },
    { key: 'feedback', metric: countMetric(feedback, prevOf('feedback')), footnote: 'QR geri bildirimi + tüketim yorumu' },
    {
      key: 'csat',
      metric: {
        value: csat,
        format: 'percent',
        n: ratedCur,
        minN: 20,
        series: csatSeries,
        asOf,
        delta: csat != null && csatPrev != null ? { value: Math.round((csat - csatPrev) * 10) / 10, kind: 'points', goodDirection: 'up', label } : null,
      },
      footnote: '4-5 yıldız oranı',
    },
    { key: 'consumptions', metric: countMetric(consumptions, prevOf('consumption')) },
    {
      key: 'pointsMinted',
      metric: { ...countMetric(minted, mintedPrev), unit: 'puan', compact: true, delta: (() => {
        const d = pctChange(sum(minted), mintedPrev);
        // Basım artışı iyi/kötü değildir (ekonomi dengesi) → nötr yön.
        return d == null ? null : { value: d, kind: 'percent' as const, goodDirection: 'neutral' as const, label };
      })() },
      footnote: `Harcanan: ${spentCur.toLocaleString('tr-TR')} puan`,
    },
    {
      key: 'activeDealers',
      metric: {
        value: dealersCur,
        format: 'number',
        series: dealerSeries,
        asOf,
        delta: dealersDelta == null ? null : { value: dealersDelta, kind: 'percent', goodDirection: 'up', label },
      },
      footnote: 'En az bir tüketim ya da geri bildirim alan',
    },
  ];

  return { kpis, pulse: { feedback, consumptions, newUsers } };
}

// ───────────────────────────── Kuyruklar ─────────────────────────────

export async function computeQueues(now: Date = new Date()): Promise<QueueSection> {
  const legalCutoff = new Date(now.getTime() - DSR_LEGAL_DAYS * 86_400_000);
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const soonLegal = new Date(soon.getTime() - DSR_LEGAL_DAYS * 86_400_000);
  const open = { status: { in: [...OPEN_DSR_STATUSES] } };

  const [
    dsrOpen,
    dsrOverdue,
    dsrSoon,
    suspiciousOpen,
    suspiciousHigh,
    incidentsOpen,
    securityOpen,
    aiQualityPending,
    flaggedUsers,
    segmentPending,
    pointsPending,
  ] = await Promise.all([
    prisma.dataSubjectRequest.count({ where: open }),
    prisma.dataSubjectRequest.count({
      where: { ...open, OR: [{ dueAt: { lt: now } }, { dueAt: null, createdAt: { lt: legalCutoff } }] },
    }),
    prisma.dataSubjectRequest.count({
      where: {
        ...open,
        OR: [
          { dueAt: { gte: now, lt: soon } },
          { dueAt: null, createdAt: { gte: legalCutoff, lt: soonLegal } },
        ],
      },
    }),
    prisma.suspiciousActivity.count({ where: { isResolved: false } }),
    prisma.suspiciousActivity.count({ where: { isResolved: false, severity: { in: ['HIGH', 'CRITICAL'] } } }),
    prisma.incident.count({ where: { status: { in: ['open', 'assigned', 'in_progress'] } } }),
    prisma.securityAlert.count({ where: { isResolved: false, severity: { in: ['ERROR', 'CRITICAL'] } } }),
    prisma.aIQualitySample.count({ where: { status: 'pending' } }),
    prisma.user.count({ where: { fraudStatus: 'flagged' } }),
    prisma.segmentCampaignProposal.count({ where: { status: 'PENDING' } }),
    prisma.pointsLedger.count({ where: { status: 'pending' } }),
  ]);

  const groups: QueueGroup[] = [
    {
      id: 'dsr',
      title: 'KVKK talepleri',
      description: `Yasal yanıt süresi ${DSR_LEGAL_DAYS} gün`,
      href: '/admin/privacy',
      total: dsrOpen,
      tone: dsrOverdue > 0 ? 'danger' : dsrSoon > 0 ? 'warning' : queueTone(dsrOpen),
      rows: [
        { id: 'dsr-overdue', label: 'Süresi geçen', count: dsrOverdue, tone: queueTone(dsrOverdue, true), href: '/admin/privacy' },
        { id: 'dsr-soon', label: '7 gün içinde dolacak', count: dsrSoon, tone: queueTone(dsrSoon), href: '/admin/privacy' },
        { id: 'dsr-open', label: 'Açık talep', count: dsrOpen, tone: dsrOpen > 0 ? 'neutral' : 'success', href: '/admin/privacy' },
      ],
    },
    {
      id: 'cases',
      title: 'Vakalar',
      description: 'Şüpheli etkinlik, güvenlik uyarısı, bayi vakası',
      href: '/admin/trust',
      total: suspiciousOpen + incidentsOpen + securityOpen,
      tone: suspiciousHigh + securityOpen > 0 ? 'danger' : queueTone(suspiciousOpen + incidentsOpen),
      rows: [
        { id: 'sus-high', label: 'Yüksek/kritik şüpheli etkinlik', count: suspiciousHigh, tone: queueTone(suspiciousHigh, true), href: '/admin/trust' },
        { id: 'sus-open', label: 'Çözülmemiş şüpheli etkinlik', count: suspiciousOpen, tone: queueTone(suspiciousOpen), href: '/admin/trust' },
        { id: 'sec', label: 'Çözülmemiş güvenlik uyarısı', count: securityOpen, tone: queueTone(securityOpen, true), href: '/admin/trust' },
        { id: 'inc', label: 'Açık bayi vakası', count: incidentsOpen, tone: queueTone(incidentsOpen), href: '/admin/dealers-health' },
      ],
    },
    {
      id: 'review',
      title: 'İnceleme',
      description: 'İnsan kararı bekleyen kayıtlar',
      href: '/admin/ai/quality',
      total: aiQualityPending + flaggedUsers + segmentPending + pointsPending,
      tone: queueTone(aiQualityPending + flaggedUsers + segmentPending + pointsPending),
      rows: [
        { id: 'flagged', label: 'İşaretli kullanıcı', count: flaggedUsers, tone: queueTone(flaggedUsers), href: '/admin/trust' },
        { id: 'points', label: 'Bekletilen puan hareketi', count: pointsPending, tone: queueTone(pointsPending), href: '/admin/economy' },
        { id: 'ai-quality', label: 'AI kalite örneği', count: aiQualityPending, tone: queueTone(aiQualityPending), href: '/admin/ai/quality' },
        { id: 'segment', label: 'Segment önerisi', count: segmentPending, tone: queueTone(segmentPending), href: '/admin/segments' },
      ],
    },
  ];

  const attention = dsrOverdue + suspiciousHigh + securityOpen;
  return { groups, attention };
}

// ───────────────────────────── Ekosistem + bayiler ─────────────────────────────

export async function computeEcosystem(): Promise<EcosystemSection> {
  const [byRoleRaw, flagged, shadowBanned, anonymized] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { fraudStatus: 'flagged' } }),
    prisma.user.count({ where: { fraudStatus: 'shadow_ban' } }),
    prisma.user.count({ where: { anonymizedAt: { not: null } } }),
  ]);
  const order = ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'] as const;
  const byRole = order.map((role) => ({
    role,
    count: byRoleRaw.find((r) => r.role === role)?._count._all ?? 0,
  }));
  return { total: sum(byRole.map((r) => r.count)), byRole, flagged, shadowBanned, anonymized };
}

type TopRow = { d: string; n: unknown; avg: unknown };

export async function computeTopDealers(w: Win): Promise<TopDealersSection> {
  const st = w.startDate;
  const rows = await prisma.$queryRaw<TopRow[]>(Prisma.sql`
    WITH v AS (
      SELECT q."dealerId" AS d, f."rating" AS r FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
       WHERE f."deletedAt" IS NULL AND f."createdAt" >= ${st}
      UNION ALL
      SELECT c."dealerId", cr."rating" FROM "ConsumptionReview" cr JOIN "Consumption" c ON c."id" = cr."consumptionId"
       WHERE cr."deletedAt" IS NULL AND cr."createdAt" >= ${st}
    )
    SELECT d, COUNT(*)::bigint AS n, AVG(r)::float8 AS avg FROM v
     GROUP BY d ORDER BY COUNT(*) DESC, AVG(r) DESC NULLS LAST, d ASC LIMIT 8
  `);
  if (rows.length === 0) return { dealers: [] };
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.d) } },
    select: { id: true, businessName: true, name: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.businessName?.trim() || u.name?.trim() || 'İsimsiz işletme']));
  return {
    dealers: rows.map((r) => {
      const avg = r.avg == null ? null : num(r.avg);
      return { dealerId: r.d, name: nameOf.get(r.d) ?? 'İsimsiz işletme', volume: num(r.n), avgRating: avg == null ? null : Math.round(avg * 10) / 10 };
    }),
  };
}

// ───────────────────────────── Genel bakış ─────────────────────────────

export async function loadCommandOverview(range: CommandRange, opts: { fresh?: boolean; now?: Date } = {}): Promise<CommandOverview> {
  const w = resolveWindow(range, opts.now);
  const fresh = !!opts.fresh;
  const winKey = `${range}:${w.start}`;
  const kpiTtl = range === '24h' ? 60 : 120;
  const [kpis, queues, ecosystem, topDealers] = await Promise.allSettled([
    cached(`${CACHE_PREFIX}:kpis:${winKey}`, kpiTtl, fresh, () => computeKpis(w)),
    cached(`${CACHE_PREFIX}:queues`, 30, fresh, () => computeQueues()),
    cached(`${CACHE_PREFIX}:eco`, 300, fresh, () => computeEcosystem()),
    cached(`${CACHE_PREFIX}:top:${winKey}`, 300, fresh, () => computeTopDealers(w)),
  ]);
  const { startDate: _s, prevStartDate: _p, endDate: _e, ...window } = w;
  return {
    window,
    generatedAt: new Date().toISOString(),
    kpis: settle(kpis, 'Metrikler'),
    queues: settle(queues, 'Kuyruklar'),
    ecosystem: settle(ecosystem, 'Ekosistem'),
    topDealers: settle(topDealers, 'Bayi sıralaması'),
  };
}

// ───────────────────────────── Sağlık ─────────────────────────────

async function probeDb(): Promise<number | null> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Date.now() - t0;
  } catch {
    return null;
  }
}

async function probeRedis(): Promise<Pick<HealthCheck, 'status' | 'detail' | 'latencyMs'>> {
  if (!isRedisConfigured()) return { status: 'warn', detail: 'Yapılandırılmamış; önbellek ve hız sınırı DB’ye düşüyor', latencyMs: null };
  const t0 = Date.now();
  const token = `${t0}`;
  await redisSetJson(`${CACHE_PREFIX}:probe`, token, 30);
  const back = await redisGetJson<string>(`${CACHE_PREFIX}:probe`);
  const ms = Date.now() - t0;
  if (String(back) !== token) return { status: 'error', detail: 'Yazma/okuma sınaması başarısız', latencyMs: null };
  return { status: ms > 500 ? 'warn' : 'ok', detail: `${ms} ms (yaz + oku)`, latencyMs: ms };
}

async function readCron(): Promise<CronSnapshot> {
  try {
    const s = await loadCronState();
    const last = s.history?.[0] ?? null;
    return {
      lastRun: last ? { startedAt: last.startedAt, finishedAt: last.finishedAt, overall: last.overall, failed: last.failed ?? [] } : null,
      running: s.currentRun && !s.currentRun.finishedAt ? { startedAt: s.currentRun.startedAt } : null,
    };
  } catch {
    return null;
  }
}

export async function computeHealth(now: Date = new Date()): Promise<HealthSection> {
  const since24h = new Date(now.getTime() - 86_400_000);
  // Olay kuyruğu (OutboxEvent) kontrolü KALDIRILDI (veri modeli B9): üreticisi yoktu, kalıcı
  // "Kuyruk boş" yeşili sahte güvenceydi.
  const [dbMs, redis, cron, ai] = await Promise.all([
    probeDb(),
    probeRedis(),
    readCron(),
    Promise.all([
      prisma.aIUsageLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.aIUsageLog.count({ where: { createdAt: { gte: since24h }, success: false } }),
    ]).catch(() => null),
  ]);
  const mail = getMailDeliverySummary();

  const checks: HealthCheck[] = [
    {
      id: 'database',
      label: 'Veritabanı',
      status: dbStatus(dbMs),
      detail: dbMs == null ? 'Ulaşılamıyor' : `${dbMs} ms gecikme`,
      latencyMs: dbMs,
      href: '/admin/observability',
    },
    { id: 'redis', label: 'Önbellek (Redis)', ...redis, href: '/admin/observability' },
    { id: 'cron', label: 'Günlük iş (cron)', ...cronHealth(cron, now), href: '/admin/jobs' },
    {
      id: 'ai',
      label: 'AI sağlayıcı',
      ...(ai ? aiHealth(ai[0], ai[1]) : { status: 'unknown' as const, detail: 'Okunamadı' }),
      href: '/admin/ai',
    },
    {
      id: 'mail',
      label: 'E-posta',
      // Resend sandbox göndereni yalnız hesap sahibine teslim eder: yapılandırılmış görünse de
      // gerçek kullanıcılara (yedek) gönderim sessizce düşer → uyarı (arka plan O10).
      status: !mail.configured || mail.resendSandboxSender ? 'warn' : 'ok',
      detail: !mail.configured
        ? 'Gönderici yapılandırılmamış'
        : mail.resendSandboxSender
          ? 'Resend gönderen adresi sandbox (onboarding@resend.dev) — RESEND_FROM doğrulanmış alan adı olmalı'
          : `Yapılandırılmış (${[mail.smtp ? 'SMTP' : null, mail.resend ? 'Resend' : null].filter(Boolean).join(' + ')})`,
      href: '/admin/settings',
    },
  ];

  return {
    overall: overallHealth(checks.map((c) => c.status)),
    checks,
    environment: { vercelEnv: process.env.VERCEL_ENV ?? null, region: process.env.VERCEL_REGION ?? null },
  };
}

export async function loadCommandHealth(opts: { fresh?: boolean } = {}): Promise<{ data: HealthSection; generatedAt: string }> {
  return cached(`${CACHE_PREFIX}:health`, 15, !!opts.fresh, () => computeHealth());
}

// ───────────────────────────── Son olaylar ─────────────────────────────

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const at = new Date(iso ?? '');
    if (!id || id.length > 64 || Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

const ACTOR_WHERE: Record<Exclude<EventActor, 'all'>, Prisma.AuditLogWhereInput> = {
  admin: { actorType: 'user', user: { role: 'ADMIN' } },
  dealer: { actorType: 'user', user: { role: { in: ['DEALER', 'STAFF'] } } },
  customer: { actorType: 'user', user: { role: 'CUSTOMER' } },
  system: { OR: [{ actorType: { in: ['system', 'cron'] } }, { userId: null }] },
};

export const EVENTS_PAGE_SIZE = 15;

function snapshotField(snap: unknown, key: 'name' | 'email' | 'role'): string | null {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null;
  const v = (snap as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function loadCommandEvents(actor: EventActor, cursor: string | null): Promise<CommandEventsPage> {
  const c = decodeCursor(cursor);
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      actor === 'all' ? {} : ACTOR_WHERE[actor],
      c ? { OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] } : {},
    ],
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: EVENTS_PAGE_SIZE + 1,
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      createdAt: true,
      actorType: true,
      actorSnapshot: true,
      user: { select: { name: true, email: true, role: true } },
    },
  });
  const page = rows.slice(0, EVENTS_PAGE_SIZE);
  const events: CommandEvent[] = page.map((r) => {
    const role = r.user?.role ?? snapshotField(r.actorSnapshot, 'role');
    const kind = actorKindOf(r.actorType, role);
    const name =
      r.user?.name?.trim() ||
      snapshotField(r.actorSnapshot, 'name') ||
      r.user?.email ||
      snapshotField(r.actorSnapshot, 'email') ||
      (kind === 'system' ? 'Sistem' : 'Silinmiş kullanıcı');
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      actorName: name,
      actorRole: role,
      actorKind: kind,
      verb: actionVerb(r.action),
      entityLabel: entityLabel(r.entity),
      entityId: r.entityId,
      rawAction: r.action,
      rawEntity: r.entity,
    };
  });
  const last = page[page.length - 1];
  return { events, nextCursor: rows.length > EVENTS_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null };
}
