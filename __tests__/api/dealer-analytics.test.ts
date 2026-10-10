/**
 * `GET /api/dealer/analytics` ve `GET /api/dealer/heatmap` — b-analitik BFF'leri.
 *
 *  - Varsayılan reddet: CUSTOMER 403 (DB'ye dokunulmaz); ADMIN `dealerId`'siz 400 (eski ölü dal).
 *  - Geçersiz dönem 400 (B-16); `fresh=1` önbelleği atlar, ayrı hız sınırıyla.
 *  - Kovalar SQL'de İstanbul saatiyle (`AT TIME ZONE`, `ISODOW`) — B-3 / heatmap Bulgu 1-2.
 *  - Isı haritası modül kapısı (Bulgu 10); DB hatası görünür (200 + sıfır yok).
 *  - Şube süzgeci yalnız bayinin kendi şubesiyle (başka kiracı şubesi düşer).
 */
import { NextRequest } from 'next/server';

// jest `@prisma/client`'ı node_modules taslağına çözer; `Prisma.sql/join/raw` üretilmiş istemcide.
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
const mockRate = jest.fn();
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: (...a: unknown[]) => mockRate(...a) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
jest.mock('@/lib/redis', () => ({
  redisGetJson: (...a: unknown[]) => mockRedisGet(...a),
  redisSetJson: (...a: unknown[]) => mockRedisSet(...a),
}));
const mockModuleGate = jest.fn();
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: (...a: unknown[]) => mockModuleGate(...a) }));

const mockConnectivity = jest.fn(() => false);
const sqlLog: string[] = [];
const mockQueryRaw = jest.fn();
const db = {
  $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
  qRCode: { findMany: jest.fn() },
  dealerLocation: { findMany: jest.fn() },
  feedback: { findFirst: jest.fn() },
  consumptionReview: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  dealerStaff: { findFirst: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: (e: unknown) => mockConnectivity(e) }));

import { GET as getOverview } from '@/app/api/dealer/analytics/route';
import { GET as getHeatmap } from '@/app/api/dealer/heatmap/route';

const dealer = { session: { user: { id: 'dealer-1', role: 'DEALER' }, expires: '2099-01-01' } };

function sqlText(arg: unknown): string {
  const s = arg as { strings?: string[]; values?: unknown[] };
  return (s.strings ?? []).join('?');
}

/** SQL metnine göre sahte sonuç (her sorgu tipini ayırt eder). */
function fakeRaw(arg: unknown) {
  const text = sqlText(arg);
  sqlLog.push(text);
  if (text.includes('"AnalyticsEvent"')) return Promise.resolve([{ qr_id: 'qr-a', n: 20n }]);
  if (text.includes('jsonb_array_elements_text')) return Promise.resolve([{ topic: 'Servis', n: 3n, positive: 0n, negative: 3n }]);
  if (text.includes('ISODOW') && text.includes('"Consumption" c') && !text.includes('"ConsumptionReview"'))
    return Promise.resolve([{ dow: 5, hour: 20, n: 4n, revenue: 600 }]);
  if (text.includes('ISODOW')) return Promise.resolve([{ dow: 1, hour: 19, n: 12n, rating_sum: 48n, negative: 1n }]);
  if (text.includes('GROUP BY 1') && text.includes('ev.qr_id')) {
    return Promise.resolve([{ qr_id: 'qr-a', n: 12n, rating_sum: 48n, positive: 9n, neutral: 2n, negative: 1n, pending: 0n }]);
  }
  if (text.includes("to_char(")) {
    return Promise.resolve([{ day: '2026-10-05', n: 12n, rating_sum: 48n, positive: 9n, neutral: 2n, negative: 1n, pending: 0n }]);
  }
  if (text.includes('percentile_cont')) {
    return Promise.resolve([
      {
        n: 12n, rating_sum: 48n, positive: 9n, neutral: 2n, negative: 1n, pending: 0n, replied: 6n, reply_median_sec: 3600,
        nps_n: 0n, promoters: 0n, detractors: 0n, r1: 0n, r2: 1n, r3: 2n, r4: 3n, r5: 6n, qr_n: 10n, topics_base: 4n,
      },
    ]);
  }
  return Promise.resolve([]);
}

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  sqlLog.length = 0;
  mockRequireAuth.mockResolvedValue(dealer);
  mockRate.mockResolvedValue({ ok: true, remaining: 100 });
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(undefined);
  mockModuleGate.mockResolvedValue(null);
  mockConnectivity.mockReturnValue(false);
  mockQueryRaw.mockImplementation(fakeRaw);
  db.dealerLocation.findMany.mockResolvedValue([{ id: 'loc-1', name: 'Kadıköy' }]);
  db.qRCode.findMany.mockResolvedValue([
    { id: 'qr-a', name: 'Masa 1', code: 'A1', locationId: 'loc-1', isActive: true, archivedAt: null, revokedAt: null, location: { name: 'Kadıköy' } },
  ]);
  db.feedback.findFirst.mockResolvedValue(null);
  db.consumptionReview.findFirst.mockResolvedValue(null);
});

describe('GET /api/dealer/analytics', () => {
  it('CUSTOMER reddedilir ve DB sorgulanmaz', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const res = await getOverview(req('/api/dealer/analytics'), {});
    expect(res.status).toBe(403);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('ADMIN dealerId vermeden kapsam alamaz (ölü ADMIN dalı kapandı)', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'admin-1', role: 'ADMIN' }, expires: '2099-01-01' } });
    const res = await getOverview(req('/api/dealer/analytics'), {});
    expect(res.status).toBe(400);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('geçersiz dönem 400', async () => {
    const res = await getOverview(req('/api/dealer/analytics?period=xyz'), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION');
  });

  it('tiplendirilmiş KPI + İstanbul kovaları + aynı pencere dönüşümü', async () => {
    const res = await getOverview(req('/api/dealer/analytics?period=last7'), {});
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.query.preset).toBe('last7');
    expect(data.kpis.avgRating).toMatchObject({ value: 4, unit: '/ 5', n: 12 });
    expect(data.kpis.avgRating.delta).toEqual({ value: 0, kind: 'absolute', goodDirection: 'up' });
    expect(data.kpis.positiveShare.delta.kind).toBe('points');
    // Dönüşüm: dönem içi QR geri bildirimi (10) / dönem içi tarama (20).
    expect(data.kpis.conversion.value).toBe(50);
    expect(data.conversionStatus).toBe('ok');
    expect(data.series).toHaveLength(7);
    expect(data.peaks.day).toMatchObject({ day: 'mon', count: 12 });
    expect(data.topics[0]).toMatchObject({ key: 'service', quadrant: 'fix' });
    expect(data.qr[0]).toMatchObject({ id: 'qr-a', feedbacks: 12, scans: 20 });
    expect(data.filters.locations).toEqual([{ id: 'loc-1', name: 'Kadıköy' }]);
    // Her kova sorgusu İstanbul saatiyle; bayi kapsamı parametre olarak.
    const bucketed = sqlLog.filter((s) => s.includes('ISODOW') || s.includes('to_char('));
    expect(bucketed.length).toBeGreaterThan(0);
    for (const s of bucketed) expect(s).toContain("AT TIME ZONE 'Europe/Istanbul'");
    for (const call of mockQueryRaw.mock.calls) {
      expect((call[0] as { values: unknown[] }).values).toContain('dealer-1');
    }
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('başka kiracının şubesi süzgeçte düşer', async () => {
    const res = await getOverview(req('/api/dealer/analytics?location=foreign-loc'), {});
    const { data } = await res.json();
    expect(data.filters.location).toBeNull();
    for (const call of mockQueryRaw.mock.calls) {
      expect((call[0] as { values: unknown[] }).values).not.toContain('foreign-loc');
    }
  });

  it('önbellek isabeti DB\'ye gitmez; fresh=1 atlar ve sıkı sınıra tabi', async () => {
    mockRedisGet.mockResolvedValue({ cached: true });
    const hit = await getOverview(req('/api/dealer/analytics'), {});
    expect((await hit.json()).data).toEqual({ cached: true });
    expect(mockQueryRaw).not.toHaveBeenCalled();

    const fresh = await getOverview(req('/api/dealer/analytics?fresh=1'), {});
    expect(fresh.status).toBe(200);
    expect(mockQueryRaw).toHaveBeenCalled();
    expect(mockRate).toHaveBeenCalledWith('dealer-analytics:fresh:dealer-1', 6, 60_000);

    mockRate.mockImplementation(async (bucket: string) => (bucket.startsWith('dealer-analytics:fresh') ? { ok: false, retryAfterMs: 30_000 } : { ok: true }));
    const limited = await getOverview(req('/api/dealer/analytics?fresh=1'), {});
    expect(limited.status).toBe(429);
  });

  it('DB hatası görünür (200 + sıfır yok)', async () => {
    mockQueryRaw.mockRejectedValue(new Error('boom'));
    const res = await getOverview(req('/api/dealer/analytics'), {});
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it('veri yokken boş durum bayrağı (sahte zirve yok)', async () => {
    mockQueryRaw.mockResolvedValue([]);
    db.qRCode.findMany.mockResolvedValue([]);
    const res = await getOverview(req('/api/dealer/analytics'), {});
    const { data } = await res.json();
    expect(data.hasAnyData).toBe(false);
    expect(data.peaks.hour).toBeNull();
    expect(data.peaks.day).toBeNull();
    expect(data.kpis.avgRating.value).toBeNull();
  });
});

describe('GET /api/dealer/heatmap', () => {
  it('modül kapalıysa 403 MODULE_DISABLED ve DB sorgulanmaz', async () => {
    const { NextResponse } = await import('next/server');
    mockModuleGate.mockResolvedValue(NextResponse.json({ code: 'MODULE_DISABLED' }, { status: 403 }));
    const res = await getHeatmap(req('/api/dealer/heatmap'), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('Pazartesi ilk satır, gün anahtarı, ziyaret/ciro ayrı metrik', async () => {
    const res = await getHeatmap(req('/api/dealer/heatmap?metric=visits'), {});
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.rows.map((r: { day: string }) => r.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(data.rows[0].cells[19]).toMatchObject({ feedback: 12, avgRating: 4 });
    expect(data.rows[4].cells[20]).toMatchObject({ visits: 4, revenue: 600 });
    expect(data.filters.metric).toBe('visits');
    expect(data.availability).toEqual({ visits: true, revenue: true });
    expect(data.totals).toMatchObject({ feedback: 12, visits: 4, revenue: 600 });
    expect(data.locations[0]).toMatchObject({ id: 'loc-1', name: 'Kadıköy', feedbacks: 12 });
    for (const s of sqlLog.filter((x) => x.includes('ISODOW'))) expect(s).toContain("AT TIME ZONE 'Europe/Istanbul'");
  });

  it('şube seçiliyken ziyaret metriği yok → geri bildirime düşer', async () => {
    const res = await getHeatmap(req('/api/dealer/heatmap?metric=visits&location=loc-1'), {});
    const { data } = await res.json();
    expect(data.availability.visits).toBe(false);
    expect(data.filters.metric).toBe('feedback');
    expect(sqlLog.some((s) => s.includes('"Consumption" c') && !s.includes('"ConsumptionReview"'))).toBe(false);
  });
});
