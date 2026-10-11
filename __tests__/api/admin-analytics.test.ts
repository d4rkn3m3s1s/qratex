/**
 * `GET /api/admin/analytics/[section]` ve `GET /api/admin/insights` — a-analitik BFF'leri.
 *
 *  - Varsayılan reddet: ADMIN dışı 403, DB'ye dokunulmaz.
 *  - Geçersiz dönem/bölüm 400/404 (B-16).
 *  - Kovalar İstanbul saatiyle, silinenler hariç, temiz veri varsayılanı (B-3, B-4).
 *  - DB hatası görünür ve önbelleğe YAZILMAZ (B-10); önbellek isabeti sorgu eşleşirse kullanılır.
 *  - `fresh=1` önbelleği atlar ve sıkı hız sınırına tabi; sektör bölümü modül kapısına bağlı.
 */
import { NextRequest } from 'next/server';

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
const db = { $queryRaw: (...a: unknown[]) => mockQueryRaw(...a) };
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: (e: unknown) => mockConnectivity(e) }));

import { GET as getSection } from '@/app/api/admin/analytics/[section]/route';
import { GET as getInsights } from '@/app/api/admin/insights/route';

const admin = { session: { user: { id: 'admin-1', role: 'ADMIN' }, expires: '2099-01-01' } };

function sqlText(arg: unknown): string {
  const s = arg as { strings?: string[] };
  return (s.strings ?? []).join('?');
}

function fakeRaw(arg: unknown) {
  const text = sqlText(arg);
  sqlLog.push(text);
  if (text.includes('array_agg(pc."name")')) {
    return Promise.resolve([
      { id: 'd1', name: 'Kahve Evi', business_category: 'cafe', product_categories: null },
      { id: 'd2', name: null, business_category: 'demo-cafe', product_categories: ['Izgara Köfte'] },
    ]);
  }
  if (text.includes('"PhysicalCard" pc GROUP BY')) return Promise.resolve([{ status: 'ACTIVATED', archived: false, n: 3n }]);
  if (text.includes('AS activated,')) return Promise.resolve([{ activated: 2n, blocked: 0n, consumptions: 10n, reviews: 4n }]);
  if (text.includes('jsonb_array_elements_text')) {
    if (text.includes('AS hour')) return Promise.resolve([{ topic: 'servis', hour: 21, n: 3n }]);
    if (text.includes('dealer_id AS dealer_id')) return Promise.resolve([{ topic: 'servis', dealer_id: 'd1', n: 3n }]);
    return Promise.resolve([{ topic: 'servis', n: 1n }]);
  }
  if (text.includes('jsonb_array_length')) return Promise.resolve([{ n: 3n }]);
  if (text.includes("'negative')::bigint AS n FROM ev")) return Promise.resolve([{ n: 4n }]);
  if (text.includes('ev.dealer_id AS dealer_id')) {
    return Promise.resolve([{ dealer_id: 'd1', n: 8n, rating_sum: 32n, rating_sq: 130n, positive: 6n, negative: 1n }]);
  }
  if (text.includes('"AnalyticsEvent"') && text.includes("'dealerId' AS dealer_id")) return Promise.resolve([{ dealer_id: 'd1', n: 5n }]);
  if (text.includes('"AnalyticsEvent"')) return Promise.resolve([{ day: '2026-10-05', n: 5n }]);
  if (text.includes('ISODOW')) return Promise.resolve([{ dow: 1, hour: 19, n: 6n }]);
  if (text.includes('AS activated') && text.includes('"role" = \'CUSTOMER\'')) return Promise.resolve([{ total: 4n, activated: 1n }]);
  if (text.includes('"role"::text AS role')) return Promise.resolve([{ role: 'CUSTOMER', n: 10n }, { role: 'STAFF', n: 2n }]);
  if (text.includes('u."createdAt"') && text.includes('to_char(')) return Promise.resolve([{ day: '2026-10-05', n: 2n }]);
  if (text.includes('to_char(')) return Promise.resolve([{ day: '2026-10-05', n: 8n, rating_sum: 32n, negative: 1n }]);
  if (text.includes('COUNT(DISTINCT ev.user_id)')) {
    return Promise.resolve([{ n: 8n, rating_sum: 32n, positive: 6n, neutral: 1n, negative: 1n, pending: 0n, r1: 0n, r2: 1n, r3: 1n, r4: 2n, r5: 4n, users: 5n }]);
  }
  return Promise.resolve([]);
}

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

const ctx = (section: string) => ({ params: Promise.resolve({ section }) });

beforeEach(() => {
  jest.clearAllMocks();
  sqlLog.length = 0;
  mockRequireAuth.mockResolvedValue(admin);
  mockRate.mockResolvedValue({ ok: true });
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(undefined);
  mockModuleGate.mockResolvedValue(null);
  mockQueryRaw.mockImplementation(fakeRaw);
});

describe('GET /api/admin/analytics/[section]', () => {
  it('ADMIN dışı 403, DB\'ye dokunulmaz', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const res = await getSection(req('/api/admin/analytics/overview'), ctx('overview'));
    expect(res.status).toBe(403);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('geçersiz dönem 400, bilinmeyen bölüm 404', async () => {
    expect((await getSection(req('/api/admin/analytics/overview?period=1y'), ctx('overview'))).status).toBe(400);
    expect((await getSection(req('/api/admin/analytics/nope'), ctx('nope'))).status).toBe(404);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('genel bakış: İstanbul kovaları, silinenler hariç, temiz veri; tek Comparison sözleşmesi', async () => {
    const res = await getSection(req('/api/admin/analytics/overview?from=2026-10-01&to=2026-10-07'), ctx('overview'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const d = body.data;
    expect(d.kpis.reviews).toEqual({ current: 8, previous: 8, deltaAbs: 0, deltaPct: 0 });
    expect(d.kpis.avgRating.current).toBe(4);
    expect(d.sentiment).toEqual({ positive: 6, neutral: 1, negative: 1, pending: 0, total: 8 });
    expect(d.userBase.byRole).toEqual({ CUSTOMER: 10, DEALER: 0, STAFF: 2, ADMIN: 0 });
    expect(d.series).toHaveLength(7);
    expect(d.heatmap.cells[0][19]).toBe(6);
    expect(d.tz).toBe('Europe/Istanbul');
    const all = sqlLog.join('\n');
    expect(all).toContain("AT TIME ZONE 'Europe/Istanbul'");
    expect(all).toContain('ISODOW');
    expect(all).toContain('f."deletedAt" IS NULL');
    expect(all).toContain('r."deletedAt" IS NULL');
    expect(all).toContain('f."trustFlagged" = false');
    expect(all).toContain("'shadow_ban'");
    expect(all).not.toContain('"scanCount"');
    // sonuç ve alt bölümler önbelleğe yazıldı
    expect(mockRedisSet.mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining(':overview:'), expect.stringContaining(':dealers:'), expect.stringContaining(':root-cause:')]),
    );
  });

  it('clean=0 temiz veri koşulunu kaldırır', async () => {
    await getSection(req('/api/admin/analytics/dealers?clean=0'), ctx('dealers'));
    expect(sqlLog.join('\n')).not.toContain('trustFlagged');
  });

  it('bayiler: sektör türetilir (demo etiketi yok sayılır), Bayes + kıyas alanları', async () => {
    const res = await getSection(req('/api/admin/analytics/dealers'), ctx('dealers'));
    const d = (await res.json()).data;
    expect(d.totalDealers).toBe(2);
    expect(d.silent).toBe(1);
    expect(d.rows[0]).toMatchObject({ id: 'd1', sector: 'kahve', n: 8, avgRating: 4, status: 'no-peers' });
  });

  it('sektör süzgeci SQL\'e bayi listesi olarak iner', async () => {
    await getSection(req('/api/admin/analytics/dealers?sector=restoran'), ctx('dealers'));
    expect(sqlLog.some((t) => t.includes('= ANY('))).toBe(true);
  });

  it('kök neden: konu normalize, pay ve gün dilimi', async () => {
    const res = await getSection(req('/api/admin/analytics/root-cause'), ctx('root-cause'));
    const d = (await res.json()).data;
    expect(d.topicBase).toBe(3);
    expect(d.topics[0]).toMatchObject({ key: 'service', count: 3, share: 100 });
    expect(d.topics[0].dayParts.evening).toBe(3);
    expect(d.topics[0].dealers[0]).toMatchObject({ id: 'd1', name: 'Kahve Evi' });
  });

  it('kart sistemi: dönem ve envanter ayrı', async () => {
    const res = await getSection(req('/api/admin/analytics/cards'), ctx('cards'));
    const d = (await res.json()).data;
    expect(d.allTime).toMatchObject({ total: 3, activated: 3 });
    expect(d.period.reviewRate.current).toBe(40);
  });

  it('DB hatası görünür (200 + sıfır yok) ve önbelleğe yazılmaz', async () => {
    mockQueryRaw.mockRejectedValue(new Error('boom'));
    const res = await getSection(req('/api/admin/analytics/cards'), ctx('cards'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('önbellek isabeti yalnız aynı sorgu için; fresh=1 atlar ve hız sınırlı', async () => {
    const res1 = await getSection(req('/api/admin/analytics/cards?period=last7'), ctx('cards'));
    const cached = (await res1.json()).data;
    mockQueryRaw.mockClear();
    mockRedisGet.mockResolvedValue(cached);
    await getSection(req('/api/admin/analytics/cards?period=last7'), ctx('cards'));
    expect(mockQueryRaw).not.toHaveBeenCalled();
    await getSection(req('/api/admin/analytics/cards?period=last90'), ctx('cards'));
    expect(mockQueryRaw).toHaveBeenCalled();

    mockQueryRaw.mockClear();
    await getSection(req('/api/admin/analytics/cards?period=last7&fresh=1'), ctx('cards'));
    expect(mockQueryRaw).toHaveBeenCalled();
    mockRate.mockImplementation((key: string) => Promise.resolve(key.startsWith('admin-analytics:fresh') ? { ok: false, retryAfterMs: 30_000 } : { ok: true }));
    const limited = await getSection(req('/api/admin/analytics/cards?fresh=1'), ctx('cards'));
    expect(limited.status).toBe(429);
  });

  it('sektör bölümü modül kapalıysa 403 MODULE_DISABLED', async () => {
    const { NextResponse } = await import('next/server');
    mockModuleGate.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    const res = await getSection(req('/api/admin/analytics/sectors'), ctx('sectors'));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/insights (geriye uyum)', () => {
  it('sektör yükleyicisini kullanır; sektörsüz bayi sayılır, k-anonimlik bayrağı döner', async () => {
    const res = await getInsights(req('/api/admin/insights'), {});
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.kMin).toBe(3);
    expect(d.totalDealers).toBe(2);
    expect(d.rows.find((r: { sector: string }) => r.sector === 'kahve')).toMatchObject({ dealerCount: 1, n: 8, scans: 5, lowSample: true });
  });
});
