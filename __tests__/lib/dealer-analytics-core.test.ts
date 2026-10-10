/**
 * Bayi Analitik (b-analitik) saf çekirdeği — rapor bulgularının hesap tarafı:
 *  - B-1 dönüşüm aynı pencere/kanal; takip boşluğunda null ("incomplete")
 *  - B-2 birimler: ★ mutlak, oran yüzde puan, hacim göreli %; önceki 0 → değişim yok
 *  - B-4 zirve yalnız örneklem eşiğinde; heatmap Bulgu 1: Pazartesi ilk satır (ISODOW 1 → mon)
 *  - #18 boş gün puanı null; B-12 bekleyen nötre sayılmaz; Bayes "en iyi"
 */
import {
  bayesAverage,
  buildHeatRows,
  buildKpis,
  buildLocationRows,
  buildQrRows,
  buildTopicRows,
  computePeaks,
  conversionOf,
  detectAnomalies,
  emptyAgg,
  fillSeries,
  heatInsights,
  pickBestQr,
  positiveShareOf,
  relDeltaPct,
  type WindowAgg,
} from '@/lib/dealer-analytics/core';
import { normalizeTopic } from '@/lib/dealer-analytics/topics';
import {
  analyticsSearchString,
  effectiveChannel,
  inboxHref,
  parseAnalyticsSearch,
  parseHeatmapSearch,
  analyticsQuerySchema,
} from '@/lib/dealer-analytics/params';
import type { SeriesPoint } from '@/lib/dealer-analytics/types';

const params = (o: Record<string, string>) => new URLSearchParams(o);

function agg(p: Partial<WindowAgg>): WindowAgg {
  return { ...emptyAgg(), ...p };
}

function point(day: string, count: number, extra: Partial<SeriesPoint> = {}): SeriesPoint {
  return { day, count, avgRating: count ? 4 : null, positive: 0, neutral: 0, negative: 0, pending: 0, compareDay: null, compareCount: null, ...extra };
}

describe('params', () => {
  it('varsayılan: son 30 gün + önceki döneme göre', () => {
    const q = parseAnalyticsSearch(params({}), '2026-10-10');
    expect(q.preset).toBe('last30');
    expect(q.range).toEqual({ from: '2026-09-11', to: '2026-10-10' });
    expect(q.compare).toBe('previous');
    expect(q.compareRange).toEqual({ from: '2026-08-12', to: '2026-09-10' });
    expect(q.channel).toBe('all');
    expect(q.location).toBeNull();
  });

  it('geçersiz değerler varsayılana düşer; şube kimliği doğrulanır', () => {
    const q = parseAnalyticsSearch(params({ period: 'xyz', channel: 'foo', location: "x' OR 1=1" }), '2026-10-10');
    expect(q.preset).toBe('last30');
    expect(q.channel).toBe('all');
    expect(q.location).toBeNull();
    expect(parseAnalyticsSearch(params({ location: 'none' }), '2026-10-10').location).toBe('none');
  });

  it('özel aralık 366 güne kırpılır; compare=none karşılaştırmayı kapatır', () => {
    const q = parseAnalyticsSearch(params({ from: '2024-01-01', to: '2026-10-10', compare: 'none' }), '2026-10-10');
    expect(q.preset).toBe('custom');
    expect(q.range.to).toBe('2026-10-10');
    expect(q.range.from).toBe('2025-10-10');
    expect(q.compareRange).toBeNull();
  });

  it('şube seçiliyse kanal fiilen QR', () => {
    expect(effectiveChannel({ channel: 'consumption', location: 'loc1' })).toBe('qr');
    expect(effectiveChannel({ channel: 'consumption', location: null })).toBe('consumption');
  });

  it('URL dizgisi varsayılanları yazmaz', () => {
    const q = parseAnalyticsSearch(params({}), '2026-10-10');
    expect(analyticsSearchString(q)).toBe('');
    expect(analyticsSearchString({ ...q, preset: 'last7', compare: 'yoy', channel: 'qr' })).toBe('period=last7&compare=yoy&channel=qr');
  });

  it('BFF şeması geçersiz dönemi reddeder (B-16)', () => {
    expect(analyticsQuerySchema.safeParse({ period: 'xyz' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ period: 'last7' }).success).toBe(true);
    expect(analyticsQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-07' }).success).toBe(true);
  });

  it('ısı haritası metriği doğrulanır', () => {
    expect(parseHeatmapSearch(params({ metric: 'visits' }), '2026-10-10').metric).toBe('visits');
    expect(parseHeatmapSearch(params({ metric: 'nope' }), '2026-10-10').metric).toBe('feedback');
  });

  it('gelen kutusu derin bağlantısı yalnız eşleşen aralığı taşır', () => {
    expect(inboxHref({ preset: 'last30', channel: 'all', location: null }, { sentiment: 'negative' })).toBe(
      '/dealer/inbox?status=all&range=30&sentiment=negative',
    );
    expect(inboxHref({ preset: 'thisMonth', channel: 'all', location: null }, { qr: 'qr1' })).toBe('/dealer/inbox?status=all&qr=qr1');
    expect(inboxHref({ preset: 'last7', channel: 'consumption', location: null })).toBe('/dealer/inbox?status=all&range=7&source=consumption');
  });
});

describe('deltalar ve KPI birimleri (B-2)', () => {
  it('önceki dönem 0 ise göreli değişim yok', () => {
    expect(relDeltaPct(5, 0)).toBeNull();
    expect(relDeltaPct(12, 10)).toBe(20);
  });

  it('puan farkı mutlak ★, olumlu oran yüzde puan, hacim göreli %', () => {
    const cur = agg({ n: 10, ratingSum: 45, positive: 5, neutral: 3, negative: 2, replied: 5 });
    const cmp = agg({ n: 10, ratingSum: 42, positive: 4, neutral: 4, negative: 2, replied: 2 });
    const { kpis } = buildKpis({ cur, cmp, series: [], scans: { current: null, compare: null }, channel: 'all' });
    expect(kpis.avgRating.value).toBe(4.5);
    expect(kpis.avgRating.delta).toEqual({ value: 0.3, kind: 'absolute', goodDirection: 'up' });
    expect(kpis.positiveShare.delta).toEqual({ value: 10, kind: 'points', goodDirection: 'up' });
    expect(kpis.responseRate.delta).toEqual({ value: 30, kind: 'points', goodDirection: 'up' });
    expect(kpis.volume.delta).toEqual({ value: 0, kind: 'percent', goodDirection: 'up' }); // 10 → 10: değişmedi
  });

  it('karşılaştırma kapalıysa delta yok; veri yoksa değer null (uydurma 0 yok)', () => {
    const { kpis } = buildKpis({ cur: emptyAgg(), cmp: null, series: [], scans: { current: null, compare: null }, channel: 'all' });
    expect(kpis.volume.value).toBe(0);
    expect(kpis.volume.delta).toBeNull();
    expect(kpis.avgRating.value).toBeNull();
    expect(kpis.positiveShare.value).toBeNull();
    expect(kpis.nps.value).toBeNull();
    expect(kpis.medianReply.value).toBeNull();
  });

  it('olumlu payı analiz bekleyenleri paydaya katmaz (B-12)', () => {
    expect(positiveShareOf(agg({ n: 10, positive: 4, pending: 2 }))).toBe(50);
  });

  it('yanıt süresi düşüşü iyidir', () => {
    const { kpis } = buildKpis({
      cur: agg({ n: 4, replied: 2, replyMedianSec: 1800 }),
      cmp: agg({ n: 4, replied: 2, replyMedianSec: 3600 }),
      series: [],
      scans: { current: null, compare: null },
      channel: 'all',
    });
    expect(kpis.medianReply.delta).toEqual({ value: -50, kind: 'percent', goodDirection: 'down' });
  });
});

describe('dönüşüm (B-1)', () => {
  it('tarama yoksa ya da pay paydayı aşarsa değer verilmez', () => {
    expect(conversionOf(3, null)).toEqual({ value: null, status: 'no_scans' });
    expect(conversionOf(3, 0)).toEqual({ value: null, status: 'no_scans' });
    expect(conversionOf(30, 10)).toEqual({ value: null, status: 'incomplete' });
    expect(conversionOf(5, 20)).toEqual({ value: 25, status: 'ok' });
  });

  it('tüketim kanalında uygulanamaz; pay yalnız QR geri bildirimi', () => {
    const cur = agg({ n: 40, qrN: 10 });
    const all = buildKpis({ cur, cmp: null, series: [], scans: { current: 50, compare: null }, channel: 'all' });
    expect(all.kpis.conversion.value).toBe(20);
    const cons = buildKpis({ cur, cmp: null, series: [], scans: { current: 50, compare: null }, channel: 'consumption' });
    expect(cons.conversionStatus).toBe('not_applicable');
    expect(cons.kpis.conversion.value).toBeNull();
  });
});

describe('seri', () => {
  it('boş gün 0 adet + null puan; karşılaştırma sırayla hizalanır', () => {
    const s = fillSeries(
      { from: '2026-10-01', to: '2026-10-03' },
      { from: '2026-09-28', to: '2026-09-30' },
      [{ day: '2026-10-02', n: 2n, rating_sum: 9n, positive: 1n, neutral: 1n, negative: 0n, pending: 0n }],
      [{ day: '2026-09-28', n: 4n }],
    );
    expect(s.map((p) => p.count)).toEqual([0, 2, 0]);
    expect(s.map((p) => p.avgRating)).toEqual([null, 4.5, null]);
    expect(s[0].compareDay).toBe('2026-09-28');
    expect(s.map((p) => p.compareCount)).toEqual([4, 0, 0]);
  });
});

describe('zirve (B-4)', () => {
  it('eşik altında zirve üretilmez (sahte "Pazar 0:00" yok)', () => {
    const p = computePeaks([{ dow: 7, hour: 0, n: 3 }]);
    expect(p.hour).toBeNull();
    expect(p.day).toBeNull();
    expect(p.n).toBe(3);
  });

  it('ISO gün 1 = Pazartesi', () => {
    const p = computePeaks([
      { dow: 1, hour: 19, n: 8 },
      { dow: 5, hour: 12, n: 4 },
    ]);
    expect(p.day).toEqual({ day: 'mon', count: 8, share: 66.7 });
    expect(p.hour?.hour).toBe(19);
  });
});

describe('anomali', () => {
  it('kısa dönemde üretilmez', () => {
    expect(detectAnomalies([point('2026-10-01', 50, { negative: 40 })])).toEqual([]);
  });

  it('olumsuz sıçramayı yakalar', () => {
    const series = Array.from({ length: 20 }, (_, i) =>
      point(`2026-09-${String(i + 1).padStart(2, '0')}`, 5, { positive: 4, negative: i === 10 ? 4 : 0, neutral: i === 10 ? 0 : 1 }),
    );
    const a = detectAnomalies(series);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ day: '2026-09-11', kind: 'negative_spike', value: 4 });
  });
});

describe('konular', () => {
  it('eşanlamlılar kanonik anahtarda birleşir', () => {
    expect(normalizeTopic('Servis')).toEqual({ key: 'service', known: true });
    expect(normalizeTopic('HİZMET')).toEqual({ key: 'service', known: true });
    expect(normalizeTopic('SERVICE')).toEqual({ key: 'service', known: true });
    expect(normalizeTopic('Müzik')).toEqual({ key: 'müzik', known: false });
    expect(normalizeTopic('')).toBeNull();
    const rows = buildTopicRows(
      [
        { topic: 'service', count: 3, positive: 0, negative: 3 },
        { topic: 'Servis', count: 2, positive: 0, negative: 2 },
        { topic: 'taste', count: 4, positive: 4, negative: 0 },
      ],
      [{ topic: 'hizmet', count: 1, positive: 0, negative: 1 }],
    );
    expect(rows[0]).toMatchObject({ key: 'service', count: 5, negative: 5, net: -1, compareCount: 1, quadrant: 'fix' });
    expect(rows[1]).toMatchObject({ key: 'taste', quadrant: 'strength', compareCount: 0 });
  });
});

describe('QR tablosu ve Bayes', () => {
  const meta = [
    { id: 'a', name: 'Masa 1', code: 'A', locationId: null, locationName: null, archived: false },
    { id: 'b', name: 'Masa 2', code: 'B', locationId: null, locationName: null, archived: false },
    { id: 'c', name: 'Eski', code: 'C', locationId: null, locationName: null, archived: true },
  ];

  it('arşivli + dönemde kaydı olmayan QR listelenmez; dönüşüm aynı pencere', () => {
    const rows = buildQrRows({
      meta,
      cur: [
        { qr_id: 'a', n: 1n, rating_sum: 5n, positive: 1n, pending: 0n },
        { qr_id: 'b', n: 40n, rating_sum: 192n, positive: 36n, pending: 0n },
      ],
      cmp: [{ qr_id: 'b', n: 20n }],
      scans: new Map([['b', 80]]),
      prior: 4.6,
    });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
    expect(rows[0]).toMatchObject({ feedbacks: 40, avgRating: 4.8, conversion: 50, feedbackDelta: 100 });
    expect(rows[1]).toMatchObject({ scans: 0, conversion: null, compareFeedbacks: 0, feedbackDelta: null });
    // 1 adet 5★ QR, 40 adet 4,8★ QR'ı geçemez.
    expect(pickBestQr(rows)?.id).toBe('b');
  });

  it('Bayes ortalaması az örneklemi genel ortalamaya çeker', () => {
    expect(bayesAverage(5, 1, 4, 10)).toBe(4.09);
    expect(bayesAverage(0, 0, 4)).toBeNull();
  });
});

describe('ısı haritası', () => {
  it('ISO gün 1 / saat 19 → Pazartesi satırı 19. hücre (heatmap Bulgu 1)', () => {
    const rows = buildHeatRows({
      feedback: [{ dow: 1, hour: 19, n: 6n, rating_sum: 18n, negative: 2n }],
      visits: [{ dow: 7, hour: 0, n: 3n, revenue: 450.5 }],
      compareFeedback: [{ dow: 1, hour: 19, n: 2n }],
      compareVisits: null,
    });
    expect(rows[0].day).toBe('mon');
    expect(rows[0].cells[19]).toMatchObject({ feedback: 6, avgRating: 3, negative: 2, compareFeedback: 2 });
    expect(rows[6].day).toBe('sun');
    expect(rows[6].cells[0]).toMatchObject({ visits: 3, revenue: 450.5 });
  });

  it('içgörüler: eşik, kalite düşüşü, dikkat gerektiren şube', () => {
    const rows = buildHeatRows({
      feedback: [
        { dow: 5, hour: 20, n: 12n, rating_sum: 36n, negative: 4n },
        { dow: 2, hour: 12, n: 8n, rating_sum: 40n, negative: 0n },
      ],
      visits: null,
      compareFeedback: null,
      compareVisits: null,
    });
    const locations = buildLocationRows({
      meta: [
        { id: 'q1', name: 'Bahçe', code: 'Q1', locationId: 'l1', locationName: 'Kadıköy', archived: false },
        { id: 'q2', name: 'Salon', code: 'Q2', locationId: 'l2', locationName: 'Beşiktaş', archived: false },
      ],
      agg: [
        { qr_id: 'q1', n: 10n, rating_sum: 30n, positive: 3n, neutral: 4n, negative: 3n, pending: 0n },
        { qr_id: 'q2', n: 10n, rating_sum: 48n, positive: 10n, neutral: 0n, negative: 0n, pending: 0n },
      ],
      prior: 3.9,
    });
    const ins = heatInsights({ rows, metric: 'feedback', overallAvg: 3.8, locations });
    expect(ins.peak).toMatchObject({ day: 'fri', hour: 20, value: 12 });
    expect(ins.qualityDip).toMatchObject({ day: 'fri', hour: 20, avgRating: 3, n: 12 });
    expect(ins.attentionLocation).toMatchObject({ id: 'l1', name: 'Kadıköy' });

    const empty = heatInsights({ rows: buildHeatRows({ feedback: [{ dow: 1, hour: 1, n: 2n, rating_sum: 2n, negative: 2n }], visits: null, compareFeedback: null, compareVisits: null }), metric: 'feedback', overallAvg: 1, locations: [] });
    expect(empty.peak).toBeNull();
    expect(empty.attentionLocation).toBeNull();
  });
});
