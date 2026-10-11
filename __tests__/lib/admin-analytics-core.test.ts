/**
 * a-analitik saf çekirdeği: karşılaştırma sözleşmesi, seri/ısı haritası, bayi kıyası (Bayes,
 * leave-one-out, yetersiz veri), sektör kırılımı (k-anonimlik, odak önerisi), kök neden dökümü,
 * yüzdelerin 100'e tamamlanması, URL sözleşmesi ve CSV.
 */
import {
  bayesRating,
  buildDealerBenchmark,
  buildHeatmap,
  buildRootCause,
  buildSectors,
  buildSeries,
  comparison,
  dayPartOf,
  percentagesLargestRemainder,
  risingTopics,
  toAggMap,
  attentionDealers,
  MIN_N,
  type RosterDealer,
} from '@/lib/admin-analytics/core';
import {
  adminAnalyticsQuerySchema,
  adminAnalyticsSearchString,
  adminQueryCacheKey,
  parseAdminAnalyticsSearch,
} from '@/lib/admin-analytics/params';
import { dealersCsv, sectorsCsv } from '@/lib/admin-analytics/csv';
import type { AdminDealers, AdminSectors } from '@/lib/admin-analytics/types';

const P = (o: Record<string, string>) => new URLSearchParams(o);

describe('comparison', () => {
  it('karşılaştırma kapalıysa delta yok', () => {
    expect(comparison(10, undefined)).toEqual({ current: 10, previous: null, deltaAbs: null, deltaPct: null });
  });
  it('önceki 0 ise yüzde null (eski "sabit %100" yok)', () => {
    expect(comparison(5, 0)).toEqual({ current: 5, previous: 0, deltaAbs: 5, deltaPct: null });
  });
  it('mutlak ve göreli fark aynı nesnede', () => {
    expect(comparison(120, 100, 0)).toEqual({ current: 120, previous: 100, deltaAbs: 20, deltaPct: 20 });
    expect(comparison(4.2, 4.5).deltaAbs).toBeCloseTo(-0.3);
  });
});

describe('buildSeries / buildHeatmap', () => {
  it('her günü doldurur, karşılaştırma gününü sırayla eşler, boş gün ortalaması null', () => {
    const s = buildSeries({
      range: { from: '2026-10-01', to: '2026-10-03' },
      compareRange: { from: '2026-09-28', to: '2026-09-30' },
      reviews: [{ day: '2026-10-02', n: 2n, rating_sum: 9n, negative: 1n }],
      compareReviews: [{ day: '2026-09-28', n: 4n }],
      newUsers: [{ day: '2026-10-01', n: 3n }],
      scans: [{ day: '2026-10-03', n: 7n }],
    });
    expect(s).toHaveLength(3);
    expect(s[0]).toMatchObject({ day: '2026-10-01', reviews: 0, avgRating: null, newUsers: 3, compareDay: '2026-09-28', compareReviews: 4 });
    expect(s[1]).toMatchObject({ reviews: 2, avgRating: 4.5, negative: 1, compareReviews: 0 });
    expect(s[2]).toMatchObject({ scans: 7 });
  });
  it('ISODOW 1 = Pazartesi satırı; geçersiz satır atlanır', () => {
    const h = buildHeatmap([
      { dow: 1, hour: 20, n: 5n },
      { dow: 7, hour: 0, n: 2 },
      { dow: 9, hour: 1, n: 99 },
    ]);
    expect(h.cells[0]![20]).toBe(5);
    expect(h.cells[6]![0]).toBe(2);
    expect(h.total).toBe(7);
    expect(h.max).toBe(5);
  });
  it('gün dilimleri: gece kovası ayrı', () => {
    expect([0, 5, 6, 11, 12, 16, 17, 23].map(dayPartOf)).toEqual(['night', 'night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
  });
});

describe('bayi kıyası', () => {
  const roster: RosterDealer[] = [
    { id: 'a', name: 'A', sector: 'kahve' },
    { id: 'b', name: 'B', sector: 'kahve' },
    { id: 'c', name: 'C', sector: 'kahve' },
    { id: 'd', name: 'D', sector: 'kahve' },
    { id: 'e', name: 'E', sector: null },
    { id: 'f', name: 'F', sector: 'kahve' },
    { id: 'g', name: 'G', sector: 'bar' },
  ];
  const agg = (n: number, avg: number) => ({ dealer_id: '', n, rating_sum: Math.round(n * avg), positive: 0, negative: 0 });
  const current = toAggMap([
    { ...agg(20, 4.6), dealer_id: 'a' },
    { ...agg(20, 4.5), dealer_id: 'b' },
    { ...agg(20, 4.4), dealer_id: 'c' },
    { ...agg(20, 2.0), dealer_id: 'd' },
    { ...agg(20, 4.0), dealer_id: 'e' },
    { ...agg(2, 5), dealer_id: 'f' },
  ]);

  it('az örneklemli bayi "yetersiz veri", sessiz bayi ayrı sayılır; Bayes 2×5 yıldızı listenin başına çıkarmaz', () => {
    const b = buildDealerBenchmark(roster, current, null);
    expect(b.silent).toBe(1); // g
    expect(b.insufficient).toBe(1); // f
    const f = b.rows.find((r) => r.id === 'f')!;
    expect(f.status).toBe('insufficient');
    expect(f.avgRating).toBe(5);
    expect(b.rows[0]!.id).toBe('a');
    expect(f.bayesRating!).toBeLessThan(b.rows[0]!.bayesRating!);
  });

  it('segment ortalaması bayinin kendisi hariç; belirgin düşük bayi "low"', () => {
    const b = buildDealerBenchmark(roster, current, null);
    const d = b.rows.find((r) => r.id === 'd')!;
    expect(d.segmentScope).toBe('sector');
    expect(d.segmentPeers).toBe(3); // a, b, c (f yetersiz)
    expect(d.segmentAvg).toBe(4.5);
    expect(d.status).toBe('low');
    expect(attentionDealers(b.rows).map((x) => x.id)).toEqual(['d']);
  });

  it('sektörsüz bayi platform grubuyla kıyaslanır', () => {
    const b = buildDealerBenchmark(roster, current, null);
    const e = b.rows.find((r) => r.id === 'e')!;
    expect(e.segmentScope).toBe('platform');
    expect(e.segmentPeers).toBe(4);
  });

  it('önceki dönem değişimi', () => {
    const prev = toAggMap([{ dealer_id: 'a', n: 10, rating_sum: 40 }]);
    const b = buildDealerBenchmark(roster, current, prev);
    expect(b.rows.find((r) => r.id === 'a')!.deltaPct).toBe(100);
    expect(b.rows.find((r) => r.id === 'b')!.deltaPct).toBeNull();
    expect(b.rows.find((r) => r.id === 'b')!.previousN).toBe(0);
  });

  it('bayesRating önsel yoksa düz ortalama', () => {
    expect(bayesRating(10, 2, null)).toBe(5);
    expect(bayesRating(0, 0, 4)).toBeNull();
  });
  expect(MIN_N).toBeGreaterThan(1);
});

describe('sektör kırılımı', () => {
  it('k-anonimlik, sektörsüz oranı ve açıklanabilir odak önerisi', () => {
    const roster: RosterDealer[] = [
      ...['k1', 'k2', 'k3'].map((id) => ({ id, name: id, sector: 'kahve' as const })),
      ...['r1', 'r2', 'r3'].map((id) => ({ id, name: id, sector: 'restoran' as const })),
      { id: 'b1', name: 'b1', sector: 'bar' as const },
      { id: 'x', name: 'x', sector: null },
    ];
    const rows = [
      // kahve: 30 değerlendirme, hepsi 2-3 → düşük
      ...['k1', 'k2', 'k3'].map((id) => ({ dealer_id: id, n: 10, rating_sum: 25, rating_sq: 65 })),
      // restoran: yüksek
      ...['r1', 'r2', 'r3'].map((id) => ({ dealer_id: id, n: 20, rating_sum: 92, rating_sq: 424 })),
      { dealer_id: 'b1', n: 5, rating_sum: 25, rating_sq: 125 },
    ];
    const s = buildSectors({ roster, current: toAggMap(rows), previous: null, scans: new Map([['k1', 4]]) });
    const kahve = s.rows.find((r) => r.sector === 'kahve')!;
    expect(kahve.n).toBe(30);
    expect(kahve.avgRating).toBe(2.5);
    expect(kahve.scans).toBe(4);
    expect(kahve.z!).toBeLessThan(-2);
    expect(s.rows.find((r) => r.sector === 'bar')!.lowSample).toBe(true);
    expect(s.rows[s.rows.length - 1]!.sector).toBe('none');
    expect(s.uncategorized).toBe(1);
    expect(s.categorizedShare).toBe(87.5);
    expect(s.focus).toMatchObject({ sector: 'kahve', n: 30, dealers: 3 });
  });

  it('yorumsuz sektörde puan null (0.0 değil)', () => {
    const s = buildSectors({ roster: [{ id: 'a', name: 'a', sector: 'tatli' }], current: new Map(), previous: null, scans: new Map() });
    expect(s.rows[0]!.avgRating).toBeNull();
    expect(s.focus).toBeNull();
    expect(s.platformAvg).toBeNull();
  });
});

describe('kök neden', () => {
  it('konu eşanlamlıları birleşir, pay paydası konulu olumsuzlar, gün dilimi ve bayiler', () => {
    const topics = buildRootCause({
      parts: [
        { topic: 'Servis', hour: 1, n: 2n },
        { topic: 'service', hour: 20, n: 3n },
        { topic: 'fiyat', hour: 13, n: 1n },
      ],
      dealers: [
        { topic: 'hizmet', dealer_id: 'd1', n: 4n },
        { topic: 'service', dealer_id: 'd2', n: 1n },
      ],
      previous: [{ topic: 'Service', n: 2n }],
      topicBase: 10,
      names: new Map([['d1', 'Kafe Bir']]),
    });
    expect(topics[0]).toMatchObject({ key: 'service', count: 5, share: 50, previous: 2, deltaPct: 150 });
    expect(topics[0]!.dayParts).toEqual({ night: 2, morning: 0, afternoon: 0, evening: 3 });
    expect(topics[0]!.dealers[0]).toEqual({ id: 'd1', name: 'Kafe Bir', count: 4 });
    expect(risingTopics(topics).map((t) => t.key)).toEqual(['service']);
  });
});

describe('yüzde yuvarlama', () => {
  it('toplam her zaman 100', () => {
    const p = percentagesLargestRemainder([1, 1, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentagesLargestRemainder([0, 0])).toEqual([0, 0]);
  });
});

describe('URL sözleşmesi', () => {
  it('varsayılan: son 30 gün + önceki dönem, temiz veri açık', () => {
    const q = parseAdminAnalyticsSearch(P({}), '2026-10-11');
    expect(q).toMatchObject({ preset: 'last30', compare: 'previous', source: 'all', clean: true, sector: null });
    expect(q.range).toEqual({ from: '2026-09-12', to: '2026-10-11' });
    expect(q.compareRange).toEqual({ from: '2026-08-13', to: '2026-09-11' });
    expect(adminAnalyticsSearchString(q)).toBe('');
  });
  it('geçersiz değerler varsayılana düşer; geçerliler URL\'ye geri yazılır', () => {
    const q = parseAdminAnalyticsSearch(P({ source: 'x', sector: 'demo-cafe', clean: '0', period: 'last7', compare: 'yoy' }), '2026-10-11');
    expect(q.source).toBe('all');
    expect(q.sector).toBeNull();
    expect(q.clean).toBe(false);
    expect(adminAnalyticsSearchString(q, { tab: 'dealers' })).toBe('period=last7&compare=yoy&clean=0&tab=dealers');
    expect(adminQueryCacheKey(q)).toContain('c0');
  });
  it('BFF şeması geçersiz dönemi ve tek uçlu özel aralığı reddeder', () => {
    expect(adminAnalyticsQuerySchema.safeParse({ period: '1y' }).success).toBe(false);
    expect(adminAnalyticsQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
    expect(adminAnalyticsQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-05', sector: 'kahve' }).success).toBe(true);
  });
});

describe('CSV', () => {
  it('formül enjeksiyonu kaçışlanır, BOM ve ; ayırıcı', () => {
    const d = {
      rows: [{ id: '1', name: '=HYPERLINK("x")', sector: 'kahve', n: 3, avgRating: 4, bayesRating: 4.1, positiveShare: 50, negativeShare: 10, previousN: null, deltaPct: null, segmentAvg: null, segmentPeers: 0, segmentScope: 'platform', z: null, status: 'insufficient' }],
    } as unknown as AdminDealers;
    const csv = dealersCsv(d, ['Bayi', 'Sektör'], (s) => s ?? '-', (s) => s);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    const sc = sectorsCsv({ rows: [{ sector: 'none', dealerCount: 1, activeDealers: 0, n: 0, avgRating: null, dealerAvgRating: null, scans: 0, previousN: null, previousAvg: null, deltaPct: null, deltaAvg: null, z: null, lowSample: true }] } as unknown as AdminSectors, ['S'], (s) => s ?? 'Belirsiz');
    expect(sc).toContain('Belirsiz;1;0;0;;;0;;;;;1');
  });
});
