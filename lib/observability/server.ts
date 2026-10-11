/**
 * /admin/observability sunucu yükleyicisi — sayfa (SSR) ve BFF aynı fonksiyonu çağırır.
 *
 *  - Sağlık: Komuta Merkezi ile TEK kaynak (`computeHealth`): DB gecikmesi + eşik, Redis
 *    yaz/oku sınaması, cron, AI, posta. Olay kuyruğu (outbox) satırı burada gösterilmez:
 *    `createOutboxEvent` hiçbir yerden çağrılmıyor, kalıcı "0 bekliyor" yanıltıcıydı.
 *  - Webhook 24 sa: SQL COUNT (eski 1000 satırlık sessiz tavan yok).
 *  - Uç metrikleri + Web Vitals: Upstash saatlik histogramlar (örnek-bağımsız, p95/p75).
 *  - Vercel: Statuspage, 60 sn önbellek.
 *  - Sorunlar listesi sunucuda eşiklerle üretilir; her satırın tek bir sonraki adımı var.
 * Bölümler `Promise.allSettled`: biri düşerse yalnız o bölüm hata gösterir. GET yan etkisiz.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { loadCommandHealth } from '@/lib/admin-command/server';
import type {
  HealthView,
  Issue,
  ObsWindow,
  ObservabilitySnapshot,
  PlatformView,
  Section,
  TrafficView,
  VitalsView,
  JobsView,
} from './contract';
import { VITAL_META } from './contract';
import { loadTrafficView } from './route-metrics';
import { loadVitalsView } from './web-vitals';
import { loadPlatformStatus } from './vercel-status';
import { loadJobsView } from './jobs.server';

const num = (v: unknown): number => {
  const n = typeof v === 'bigint' ? Number(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

async function webhookStats24h(): Promise<HealthView['webhooks']> {
  const since = new Date(Date.now() - 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ total: number; failed: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE COALESCE(data->>'ok', 'false') <> 'true')::int AS failed
      FROM "AnalyticsEvent"
     WHERE event = 'webhook_delivery' AND category = 'webhook' AND "createdAt" >= ${since}
       AND COALESCE(data->>'test', 'false') <> 'true'`);
  const total = num(rows[0]?.total);
  const failed = num(rows[0]?.failed);
  return { deliveries24h: total, failures24h: failed, failureRatePct: total > 0 ? Math.round((failed / total) * 1000) / 10 : null };
}

export async function loadHealthView(opts: { fresh?: boolean } = {}): Promise<HealthView> {
  const [health, webhooks] = await Promise.all([
    loadCommandHealth({ fresh: opts.fresh }),
    cachedJson('obs:webhooks24h:v1', 60, webhookStats24h).catch(() => null),
  ]);
  // cron: ayrıntılı iş kartı/sorun ayrıca gösterilir. (Olay kuyruğu kontrolü kaynağında kaldırıldı.)
  const checks = health.data.checks.filter((c) => c.id !== 'cron');
  const rank = { ok: 0, unknown: 1, warn: 2, error: 3 } as const;
  const overall = checks.reduce<HealthView['overall']>((w, c) => (rank[c.status] > rank[w] ? c.status : w), 'ok');
  return {
    overall,
    checks: checks.map((c) => (c.id === 'database' ? { ...c, href: '/admin/observability#saglik' } : c.id === 'redis' ? { ...c, href: '/admin/observability#saglik' } : c)),
    deploy: {
      vercelEnv: health.data.environment.vercelEnv,
      region: health.data.environment.region,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
      commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    },
    webhooks,
  };
}

async function section<T>(p: Promise<T>, label: string): Promise<Section<T>> {
  try {
    return { ok: true, data: await p, generatedAt: new Date().toISOString() };
  } catch (e) {
    console.error(`[admin/observability] ${label} yüklenemedi:`, e);
    const msg = e instanceof Error && /[ğüşıöçİ]/i.test(e.message) ? e.message : `${label} okunamadı.`;
    return { ok: false, error: msg, generatedAt: new Date().toISOString() };
  }
}

/** Eşik tabanlı sorunlar (saf; test edilir). */
export function deriveIssues(s: Omit<ObservabilitySnapshot, 'issues' | 'generatedAt' | 'window'>): Issue[] {
  const out: Issue[] = [];
  if (s.platform.ok) {
    const p: PlatformView = s.platform.data;
    for (const inc of p.incidents) {
      out.push({
        id: `vercel:${inc.id}`,
        severity: inc.impactTone === 'critical' ? 'critical' : inc.impactTone === 'error' ? 'high' : 'medium',
        title: `Vercel: ${inc.name}`,
        detail: `${inc.statusLabel}${inc.latestUpdate ? ` · ${inc.latestUpdate.slice(0, 140)}` : ''}`,
        href: inc.shortlink ?? 'https://www.vercel-status.com',
        external: true,
        actionLabel: 'Durum sayfasında gör',
      });
    }
  }
  if (s.health.ok) {
    for (const c of s.health.data.checks) {
      if (c.status === 'error' || c.status === 'warn') {
        out.push({
          id: `health:${c.id}`,
          severity: c.status === 'error' ? 'high' : 'medium',
          title: `${c.label}: ${c.status === 'error' ? 'sorun var' : 'dikkat'}`,
          detail: c.detail,
          href: c.href,
          actionLabel: c.id === 'cron' ? 'İşleri aç' : 'İncele',
        });
      }
    }
    const w = s.health.data.webhooks;
    if (w && w.deliveries24h >= 10 && (w.failureRatePct ?? 0) >= 10) {
      out.push({
        id: 'webhooks',
        severity: (w.failureRatePct ?? 0) >= 50 ? 'high' : 'medium',
        title: `Webhook teslimlerinin %${w.failureRatePct} kadarı başarısız`,
        detail: `Son 24 saatte ${w.deliveries24h} teslimden ${w.failures24h} tanesi başarısız.`,
        href: '/admin/integrations?tab=webhooklar',
        actionLabel: 'Teslim günlüğüne git',
      });
    }
  }
  if (s.jobs.ok && (s.jobs.data.overall === 'error' || s.jobs.data.failing.length > 0)) {
    const n = s.jobs.data.failing.length;
    out.push({
      id: 'jobs',
      severity: 'high',
      title: n > 0 ? `${n} arka plan işi hata veriyor` : 'Günlük arka plan koşusu sorunlu',
      detail: n > 0 ? s.jobs.data.failing.slice(0, 4).join(', ') : s.jobs.data.detail,
      href: '/admin/jobs',
      actionLabel: 'İşleri aç',
    });
  }
  if (s.traffic.ok && s.traffic.data.collecting) {
    const t = s.traffic.data;
    if (t.totals.requests >= 50 && (t.totals.errorRatePct ?? 0) >= 2) {
      out.push({
        id: 'traffic:errors',
        severity: (t.totals.errorRatePct ?? 0) >= 10 ? 'critical' : 'high',
        title: `Sunucu hata oranı %${t.totals.errorRatePct}`,
        detail: `${t.totals.requests} istekte ${t.totals.errors5xx} adet 5xx. En çok: ${t.topErrors[0]?.route ?? '—'}.`,
        href: '/admin/observability#uclar',
        actionLabel: 'Uçları incele',
      });
    }
    const slow = t.slowest.filter((r) => (r.p95Ms ?? 0) >= 2500 && r.requests >= 20);
    if (slow.length > 0) {
      out.push({
        id: 'traffic:slow',
        severity: 'medium',
        title: `${slow.length} uç yavaş (p95 ≥ 2,5 sn)`,
        detail: slow.slice(0, 3).map((r) => r.route).join(', '),
        href: '/admin/observability#uclar',
        actionLabel: 'Yavaş uçları gör',
      });
    }
  }
  if (s.vitals.ok && s.vitals.data.collecting) {
    for (const m of s.vitals.data.metrics) {
      if (m.n >= 20 && m.rating === 'poor' && (m.name === 'LCP' || m.name === 'INP' || m.name === 'CLS')) {
        out.push({
          id: `vitals:${m.name}`,
          severity: 'medium',
          title: `${m.name} p75 zayıf (${VITAL_META[m.name].label})`,
          detail: `${m.n} örnekte p75 eşiğin üstünde.`,
          href: '/admin/observability#rum-web-vitals',
          actionLabel: 'Sayfa performansını gör',
        });
      }
    }
  }
  const order = { critical: 0, high: 1, medium: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function loadObservability(window: ObsWindow, opts: { fresh?: boolean } = {}): Promise<ObservabilitySnapshot> {
  const [health, traffic, vitals, platform, jobs] = await Promise.all([
    section(loadHealthView(opts), 'Sağlık'),
    section<TrafficView>(cachedJson(`obs:traffic:v1:${window}`, 30, () => loadTrafficView(window)), 'Uç metrikleri'),
    section<VitalsView>(cachedJson('obs:vitals:v1:24', 60, () => loadVitalsView(24)), 'Web Vitals'),
    section(loadPlatformStatus(opts), 'Vercel durumu'),
    section(
      loadJobsView().then((j: JobsView) => ({
        overall: j.overall,
        detail: j.overallDetail,
        failing: j.jobs.filter((x) => x.health === 'failing').map((x) => x.label),
        lastRunAt: j.lastRun?.startedAt ?? null,
      })),
      'Arka plan işleri'
    ),
  ]);
  const base = { health, traffic, vitals, platform, jobs };
  return { window, generatedAt: new Date().toISOString(), ...base, issues: deriveIssues(base) };
}
