/**
 * Gözlemlenebilirlik + Arka plan işleri — saf mantık ve sunucu korumaları:
 * histogram yüzdelikleri ve kesin derece sayıları, uç metriği toplama (hata/yavaş sıralaması),
 * Web Vitals görünümü (p75, sunucu tarafı derece, yol maskeleme), Statuspage eşlemesi (critical
 * artık gri değil), sorun listesi eşikleri, iş sağlığı ve "şimdi çalıştır" korumaları (bilinmeyen
 * iş 404, koşu sürerken 409, dönem içinde başarılı işe 409, denetim önce).
 */
/** @jest-environment node */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/redis', () => ({
  cachedJson: jest.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  redisGetJson: jest.fn(async () => null),
  redisSetJson: jest.fn(async () => undefined),
}));
jest.mock('@/lib/admin-command/server', () => ({ loadCommandHealth: jest.fn() }));

const auditCreate = jest.fn();
jest.mock('@/lib/prisma', () => ({ prisma: { auditLog: { create: (...a: unknown[]) => auditCreate(...a) }, $queryRaw: jest.fn() }, isPrismaConnectivityError: () => false }));

const cronState: { value: unknown } = { value: { jobs: {} } };
jest.mock('@/lib/cron-state', () => ({ loadCronState: jest.fn(async () => cronState.value) }));
jest.mock('@/app/api/cron/daily/jobs', () => ({
  DAILY_JOBS: [
    { name: 'db-cleanup', priority: 1, cadence: { kind: 'daily' }, timeoutMs: 15000, run: jest.fn() },
    { name: 'weekly-digest', priority: 3, cadence: { kind: 'weekly', weekday: 1 }, timeoutMs: 60000, run: jest.fn() },
  ],
}));
const dailyGet = jest.fn();
jest.mock('@/app/api/cron/daily/route', () => ({ GET: (...a: unknown[]) => dailyGet(...a) }));
jest.mock('@/lib/cron-auth', () => ({ cronAuthHeader: () => 'Bearer test' }));

import { bucketIndex, normalizePath, quantileFromHistogram, ratingSplit } from '@/lib/observability/histogram';
import { buildTrafficView, LATENCY_EDGES_MS } from '@/lib/observability/route-metrics';
import { buildVitalsView, isValidVital, ratingOf, vitalPath, VITAL_EDGES } from '@/lib/observability/web-vitals';
import { mapStatusSummary } from '@/lib/observability/vercel-status';
import { deriveIssues } from '@/lib/observability/server';
import { buildJobsView, jobHealth } from '@/lib/observability/jobs-core';
import { runJobNow } from '@/lib/observability/jobs.server';
import { platformTone } from '@/lib/observability/contract';

describe('histogram', () => {
  it('kova sınırı dahil (≤) ve taşma kovası', () => {
    expect(bucketIndex([10, 20], 10)).toBe(0);
    expect(bucketIndex([10, 20], 10.01)).toBe(1);
    expect(bucketIndex([10, 20], 99)).toBe(2);
  });
  it('yüzdelik kova içinde aradeğerlenir; taşmada "en az"', () => {
    expect(quantileFromHistogram([10, 20], [0, 4, 0], 0.5)).toEqual({ value: 15, atLeast: false });
    expect(quantileFromHistogram([10, 20], [1, 0, 9], 0.95)).toEqual({ value: 20, atLeast: true });
    expect(quantileFromHistogram([10, 20], [0, 0, 0], 0.5).value).toBeNull();
  });
  it('eşikler kova sınırıyken derece sayıları kesin', () => {
    const edges = VITAL_EDGES.LCP; // 2500 ve 4000 sınır
    const counts = new Array(edges.length + 1).fill(0);
    counts[bucketIndex(edges, 2500)] += 3; // iyi
    counts[bucketIndex(edges, 3000)] += 2; // geliştirilmeli
    counts[bucketIndex(edges, 4000)] += 1; // geliştirilmeli (≤ 4000)
    counts[bucketIndex(edges, 4001)] += 4; // zayıf
    expect(ratingSplit(edges, counts, 2500, 4000)).toEqual({ good: 3, needsImprovement: 3, poor: 4 });
  });
  it('yol kimlikleri maskelenir', () => {
    expect(normalizePath('/admin/users/clx1234567890abcdefghijk?tab=a')).toBe('/admin/users/:id');
    expect(normalizePath('/dealer/campaigns/42/edit')).toBe('/dealer/campaigns/:id/edit');
    expect(normalizePath('/admin/users/550e8400-e29b-41d4-a716-446655440000')).toBe('/admin/users/:id');
  });
});

describe('uç metrikleri', () => {
  it('saatleri toplar, 5xx ve yavaş uçları sıralar, 5 istekten azını yavaşlara koymaz', () => {
    const b = (ms: number) => `b${bucketIndex(LATENCY_EDGES_MS, ms)}`;
    const h1 = {
      'admin.a|n': 10, [`admin.a|${b(40)}`]: 10, 'admin.a|e5': 2,
      'admin.slow|n': 6, [`admin.slow|${b(3000)}`]: 6,
      'admin.once|n': 1, [`admin.once|${b(9000)}`]: 1, 'admin.once|e4': 1,
    };
    const h2 = { 'admin.a|n': 10, [`admin.a|${b(40)}`]: 10 };
    const v = buildTrafficView('2h', [
      { start: new Date('2026-10-11T10:00:00Z'), fields: h1 },
      { start: new Date('2026-10-11T11:00:00Z'), fields: h2 },
    ]);
    if (!v.collecting) throw new Error('toplanıyor olmalı');
    expect(v.totals.requests).toBe(27);
    expect(v.totals.errors5xx).toBe(2);
    expect(v.totals.errors4xx).toBe(1);
    expect(v.series.map((s) => s.requests)).toEqual([17, 10]);
    expect(v.topErrors[0]).toMatchObject({ route: 'admin.a', errors5xx: 2, errorRatePct: 10 });
    expect(v.slowest.map((r) => r.route)).toEqual(['admin.slow', 'admin.a']);
    expect(v.slowest[0].p95Ms).toBeGreaterThan(2500);
  });
});

describe('Web Vitals', () => {
  it('derece sunucuda değerden türetilir, aralık dışı reddedilir', () => {
    expect(ratingOf('LCP', 2500)).toBe('good');
    expect(ratingOf('LCP', 4200)).toBe('poor');
    expect(ratingOf('CLS', 0.2)).toBe('needs-improvement');
    expect(isValidVital({ name: 'LCP', value: 99_999 })).toBe(false);
    expect(isValidVital({ name: 'CLS', value: 0.05 })).toBe(true);
  });
  it('yalnız panel yolları kırılımda', () => {
    expect(vitalPath('/admin/users/123')).toBe('/admin/users/:id');
    expect(vitalPath('/fiyatlar')).toBe('(diğer)');
  });
  it('p75 ve en yavaş sayfalar (en az 5 örnek)', () => {
    const e = VITAL_EDGES.LCP;
    const fast = `b${bucketIndex(e, 900)}`;
    const slow = `b${bucketIndex(e, 5000)}`;
    const v = buildVitalsView(24, [
      { [`LCP|g|${fast}`]: 6, [`LCP|g|${slow}`]: 6, [`LCP|p|/admin|${fast}`]: 6, [`LCP|p|/dealer/x|${slow}`]: 6, [`LCP|p|/staff|${slow}`]: 2 },
    ]);
    if (!v.collecting) throw new Error('toplanıyor olmalı');
    const lcp = v.metrics.find((m) => m.name === 'LCP')!;
    expect(lcp.n).toBe(12);
    expect(lcp.poor).toBe(6);
    expect(lcp.rating).toBe('poor');
    expect(v.worstPaths.LCP.map((r) => r.path)).toEqual(['/dealer/x', '/admin']);
    expect(v.metrics.find((m) => m.name === 'INP')!.rating).toBeNull();
  });
});

describe('Vercel Statuspage eşlemesi', () => {
  it('critical/minor/major ton alır; olay etkisi ve son güncelleme gelir', () => {
    expect(platformTone('critical')).toBe('critical');
    expect(platformTone('minor')).toBe('warn');
    expect(platformTone('major_outage')).toBe('critical');
    const v = mapStatusSummary(
      {
        status: { indicator: 'major', description: 'Partial System Outage' },
        components: [
          { id: 'g', name: 'Grup', status: 'operational', group: true },
          { id: '1', name: 'Builds', status: 'degraded_performance' },
          { id: '2', name: 'Edge', status: 'operational' },
        ],
        incidents: [{ id: 'i', name: 'Gecikme', status: 'identified', impact: 'critical', incident_updates: [{ body: 'Bulundu' }], shortlink: 'javascript:alert(1)' }],
      },
      '2026-10-11T10:00:00Z'
    );
    expect(v.indicator).toMatchObject({ tone: 'error', label: 'Büyük kesinti' });
    expect(v.components).toHaveLength(2);
    expect(v.operationalCount).toBe(1);
    expect(v.incidents[0]).toMatchObject({ statusLabel: 'Neden bulundu', impactTone: 'critical', latestUpdate: 'Bulundu', shortlink: null });
  });
});

describe('sorun listesi', () => {
  const g = '2026-10-11T10:00:00Z';
  it('eşikleri aşanları önem sırasıyla üretir; sağlıklıyken boş', () => {
    const healthy = {
      health: { ok: true as const, generatedAt: g, data: { overall: 'ok' as const, checks: [{ id: 'database', label: 'Veritabanı', status: 'ok' as const, detail: '20 ms', href: '/x' }], deploy: { vercelEnv: null, region: null, commitSha: null, commitRef: null }, webhooks: { deliveries24h: 3, failures24h: 0, failureRatePct: 0 } } },
      traffic: { ok: true as const, generatedAt: g, data: { collecting: false as const, reason: 'yok' } },
      vitals: { ok: true as const, generatedAt: g, data: { collecting: false as const, reason: 'yok' } },
      platform: { ok: false as const, generatedAt: g, error: 'ulaşılamadı' },
      jobs: { ok: true as const, generatedAt: g, data: { overall: 'ok' as const, detail: '', failing: [], lastRunAt: null } },
    };
    expect(deriveIssues(healthy)).toEqual([]);
    const bad = {
      ...healthy,
      traffic: {
        ok: true as const,
        generatedAt: g,
        data: {
          collecting: true as const,
          window: '24h' as const,
          totals: { requests: 100, errors5xx: 12, errors4xx: 0, errorRatePct: 12, p95Ms: 300, p95AtLeast: false },
          series: [],
          topErrors: [{ route: 'admin.x', requests: 50, errors5xx: 12, errors4xx: 0, errorRatePct: 24, p50Ms: 10, p95Ms: 20, p95AtLeast: false }],
          slowest: [],
          routeCount: 3,
        },
      },
      jobs: { ok: true as const, generatedAt: g, data: { overall: 'error' as const, detail: '', failing: ['Haftalık özet'], lastRunAt: null } },
    };
    const issues = deriveIssues(bad);
    expect(issues.map((i) => i.id)).toEqual(['traffic:errors', 'jobs']);
    expect(issues[0].severity).toBe('critical');
  });
});

describe('arka plan işleri', () => {
  const daily = { name: 'db-cleanup', priority: 1, cadence: { kind: 'daily' as const }, timeoutMs: 15000 };
  const weekly = { name: 'weekly-digest', priority: 3, cadence: { kind: 'weekly' as const, weekday: 1 }, timeoutMs: 60000 };
  const now = new Date('2026-10-11T12:00:00Z'); // Pazar

  it('iş sağlığı: hiç koşmamış, başarısız, gecikmiş, sırasını bekleyen', () => {
    expect(jobHealth(daily, undefined, now).health).toBe('never');
    expect(jobHealth(weekly, undefined, now).health).toBe('waiting');
    expect(jobHealth(daily, { lastRunAt: '2026-10-11T03:00:00Z', lastStatus: 'failed', lastOkAt: '2026-10-10T03:00:00Z' }, now)).toEqual({ health: 'failing', due: true });
    expect(jobHealth(daily, { lastRunAt: '2026-10-11T03:00:00Z', lastStatus: 'ok', lastOkAt: '2026-10-11T03:00:00Z' }, now)).toEqual({ health: 'ok', due: false });
    expect(jobHealth(daily, { lastRunAt: '2026-10-08T03:00:00Z', lastStatus: 'ok', lastOkAt: '2026-10-08T03:00:00Z' }, now).health).toBe('overdue');
    expect(jobHealth(daily, { lastRunAt: '2026-10-10T14:00:00Z', lastStatus: 'ok', lastOkAt: '2026-10-10T14:00:00Z' }, now)).toEqual({ health: 'ok', due: true });
  });

  it('genel durum: 26 saatten eski koşu hata; durum okunamazsa bilinmiyor', () => {
    const monitors = { heartbeatUrl: false, sentryCron: false, cronSecret: true };
    const stale = buildJobsView([daily], { jobs: {}, history: [{ startedAt: '2026-10-09T03:00:00Z', finishedAt: '2026-10-09T03:01:00Z', overall: 'ok', ms: 60000, failed: [], skippedBudget: [], ran: 1 }] }, now, monitors);
    expect(stale.overall).toBe('error');
    expect(buildJobsView([daily], null, now, monitors).overall).toBe('unknown');
    const orphan = buildJobsView([daily], { jobs: { 'eski-is': { lastRunAt: 'x' } } }, now, monitors);
    expect(orphan.orphaned).toEqual(['eski-is']);
  });

  describe('şimdi çalıştır', () => {
    const actor = { id: 'admin1', type: 'user' as const };
    const req = { headers: { get: () => null } };
    beforeEach(() => {
      process.env.CRON_SECRET = 's';
      auditCreate.mockReset().mockResolvedValue({});
      dailyGet.mockReset();
    });

    it('bilinmeyen iş 404', async () => {
      await expect(runJobNow({ name: 'yok', reason: 'deneme gerekçe' }, actor, req, now)).rejects.toMatchObject({ status: 404 });
    });

    it('koşu sürerken 409, iş çalışmaz', async () => {
      cronState.value = { jobs: {}, currentRun: { startedAt: '2026-10-11T11:58:00Z', finishedAt: null } };
      await expect(runJobNow({ name: 'db-cleanup', reason: 'deneme gerekçe' }, actor, req, now)).rejects.toMatchObject({ status: 409 });
      expect(dailyGet).not.toHaveBeenCalled();
    });

    it('bu dönem başarılı işe 409 (kadans zorlama yok)', async () => {
      cronState.value = { jobs: { 'db-cleanup': { lastRunAt: '2026-10-11T03:00:00Z', lastStatus: 'ok', lastOkAt: '2026-10-11T03:00:00Z' } } };
      await expect(runJobNow({ name: 'db-cleanup', reason: 'deneme gerekçe' }, actor, req, now)).rejects.toMatchObject({ status: 409 });
    });

    it('başarısız iş orkestratörle only=<ad> çalışır; denetim önce ve sonra yazılır', async () => {
      cronState.value = { jobs: { 'db-cleanup': { lastRunAt: '2026-10-11T03:00:00Z', lastStatus: 'failed', lastOkAt: '2026-10-10T03:00:00Z' } } };
      dailyGet.mockResolvedValue(new Response(JSON.stringify({ results: { 'db-cleanup': { status: 'ok', ms: 120 } } }), { status: 200 }));
      const r = await runJobNow({ name: 'db-cleanup', reason: 'dünkü hata' }, actor, req, now);
      expect(r).toMatchObject({ status: 'ok', ms: 120, error: null });
      const url = (dailyGet.mock.calls[0][0] as Request).url;
      expect(url).toContain('only=db-cleanup');
      expect(url).not.toContain('force');
      expect(auditCreate).toHaveBeenCalledTimes(2);
      expect(auditCreate.mock.calls[0][0].data.action).toBe('jobs.run_requested');
    });

    it('denetim yazılamazsa iş çalışmaz (fail-closed)', async () => {
      cronState.value = { jobs: {} };
      auditCreate.mockRejectedValueOnce(new Error('db'));
      await expect(runJobNow({ name: 'db-cleanup', reason: 'deneme gerekçe' }, actor, req, now)).rejects.toThrow();
      expect(dailyGet).not.toHaveBeenCalled();
    });
  });
});
