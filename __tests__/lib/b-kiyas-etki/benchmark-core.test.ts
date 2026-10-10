/**
 * Bayi Kıyas saf hesap katmanı — denetim B1/B2/B3/B5/B10 kapanışları.
 */
import {
  buildRank,
  buildRails,
  buildRecommendations,
  buildSeries,
  buildTopicGaps,
  distribution,
  metricSample,
  quantile,
  resolveGroup,
  segmentInfos,
  standingAmong,
  type DealerAgg,
  type PlatformSnapshot,
  type RosterEntry,
} from '@/lib/dealer-benchmark/core';
import { benchmarkCategorySchema, benchmarkSearchString, parseBenchmarkSearch } from '@/lib/dealer-benchmark/params';

const agg = (n: number, avg: number, extra: Partial<DealerAgg> = {}): DealerAgg => ({
  n,
  ratingSum: n * avg,
  replied: Math.round(n / 2),
  negative: Math.round(n / 5),
  replyMedianSec: 3600,
  actClosed: 2,
  actRelevant: 4,
  ...extra,
});

function snapshot(current: Record<string, DealerAgg>, roster: RosterEntry[], extra: Partial<PlatformSnapshot> = {}): PlatformSnapshot {
  return {
    range: { from: '2026-10-01', to: '2026-10-07' },
    compareRange: { from: '2026-09-24', to: '2026-09-30' },
    bucket: 'day',
    current,
    previous: {},
    buckets: [],
    topics: [],
    topicBase: {},
    roster,
    ...extra,
  };
}

const r = (id: string, category: RosterEntry['category'] = 'kahve', city: string | null = 'istanbul'): RosterEntry => ({ id, category, city, isDemo: false });

describe('istatistik', () => {
  it('quantile doğrusal ara değer', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });

  it('B1: en iyi bayi küçük "üst %X", büyük "daha iyi" oranı alır', () => {
    const best = standingAmong(5, [4, 3, 2, 1], 'up');
    expect(best.position).toBe(1);
    expect(best.betterThanPercent).toBe(100);
    expect(best.topPercent).toBe(20);
    const worst = standingAmong(1, [4, 3, 2, 5], 'up');
    expect(worst.position).toBe(5);
    expect(worst.betterThanPercent).toBe(0);
    expect(worst.topPercent).toBe(100);
  });

  it('düşük-iyi metrikte yön ters', () => {
    expect(standingAmong(10, [20, 30], 'down').position).toBe(1);
  });

  it('B2: 5 katkıdan az dağılım dönmez; üst %10 için 10 gerekir', () => {
    expect(distribution([1, 2, 3, 4], 'up')).toBeNull();
    const d = distribution([1, 2, 3, 4, 5], 'up');
    expect(d?.contributors).toBe(5);
    expect(d?.top).toBeNull();
    expect(distribution([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'up')?.top).not.toBeNull();
  });

  it('B10: veri yoksa değer null (0 değil)', () => {
    expect(metricSample(undefined, 'rating', 10).value).toBeNull();
    expect(metricSample(agg(0, 0, { actRelevant: 0 }), 'actionClose', 10).value).toBeNull();
  });
});

describe('segment ve sıra', () => {
  const peers = ['a', 'b', 'c', 'd', 'e'];
  const current: Record<string, DealerAgg> = { me: agg(20, 4.5) };
  peers.forEach((id, i) => {
    current[id] = agg(20, 3 + i * 0.2);
  });
  const roster = [r('me'), ...peers.map((id) => r(id))];

  it('bayi kendini akran saymaz; k-anon eşiği katkı verenle', () => {
    const infos = segmentInfos(snapshot(current, roster), { selfId: 'me', isDemo: false, category: 'kahve', city: 'istanbul' }, 10);
    expect(infos.find((s) => s.group === 'platform')?.contributors).toBe(5);
    expect(infos.find((s) => s.group === 'category')?.reason).toBe('ok');
  });

  it('kategori yoksa not_set ve otomatik grup platform', () => {
    const infos = segmentInfos(snapshot(current, roster), { selfId: 'me', isDemo: false, category: null, city: null }, 10);
    expect(infos.find((s) => s.group === 'category')?.reason).toBe('not_set');
    expect(resolveGroup(null, infos)).toBe('platform');
  });

  it('demo hesaplar gerçek kıyasa karışmaz', () => {
    const demoRoster = [r('me'), ...peers.map((id) => ({ ...r(id), isDemo: true }))];
    const infos = segmentInfos(snapshot(current, demoRoster), { selfId: 'me', isDemo: false, category: 'kahve', city: null }, 10);
    expect(infos[0].reason).toBe('too_few');
  });

  it('B5: yetersiz akranda sahte sıra yok', () => {
    const rank = buildRank(snapshot(current, roster), 'me', ['a', 'b'], 10);
    expect(rank.status).toBe('too_few_peers');
    expect(rank.position).toBeNull();
  });

  it('yetersiz örneklemde sıralanmaz', () => {
    const s = snapshot({ ...current, me: agg(3, 5) }, roster);
    expect(buildRank(s, 'me', peers, 10).status).toBe('insufficient_data');
  });

  it('sıra ve raylar', () => {
    const s = snapshot(current, roster);
    expect(buildRank(s, 'me', peers, 10)).toMatchObject({ status: 'ok', position: 1, outOf: 6 });
    const rating = buildRails(s, 'me', peers, 10).find((x) => x.key === 'rating')!;
    expect(rating.peer?.contributors).toBe(5);
    expect(rating.standing).toBe('above');
    expect(rating.peer?.top).toBeNull();
    expect(rating.gapToTop).toBeNull();
  });
});

describe('seri ve konular', () => {
  it('B3: veri olmayan gün null', () => {
    const s = snapshot({}, [r('me')], { buckets: [['me', '2026-10-02', 4, 18, 2, 1]] });
    const series = buildSeries(s, 'me', []);
    expect(series.rating).toHaveLength(7);
    expect(series.rating[0].you).toBeNull();
    expect(series.rating[1]).toMatchObject({ you: 4.5, n: 4, peerP50: null });
  });

  it('konu açığı yalnız ≥5 akranda ve ≥5 puan farkta', () => {
    const peers = ['a', 'b', 'c', 'd', 'e'];
    const topicBase: Record<string, number> = { me: 10 };
    peers.forEach((p) => {
      topicBase[p] = 10;
    });
    const topics: [string, string, number][] = [['me', 'servis', 5], ...peers.map((p) => [p, 'servis', 1] as [string, string, number])];
    expect(buildTopicGaps(snapshot({}, [], { topics, topicBase }), 'me', peers)).toEqual([{ topic: 'servis', youShare: 50, youMentions: 5, peerShare: 10 }]);
    expect(buildTopicGaps(snapshot({}, [], { topics, topicBase }), 'me', peers.slice(0, 4))).toEqual([]);
  });

  it('öneriler ağırlığa göre sıralı', () => {
    const recs = buildRecommendations([], [], { insufficient: true, categoryMissing: true });
    expect(recs.map((x) => x.kind)).toEqual(['more_feedback', 'set_category']);
  });
});

describe('parametreler', () => {
  it('URL gidiş-dönüş', () => {
    const q = parseBenchmarkSearch(new URLSearchParams('period=last90&group=city'));
    expect(q).toEqual({ preset: 'last90', group: 'city' });
    expect(benchmarkSearchString(q)).toBe('period=last90&group=city');
    expect(parseBenchmarkSearch(new URLSearchParams('period=x'))).toEqual({ preset: 'last30', group: null });
  });

  it('kategori şeması kontrollü sözlük', () => {
    expect(benchmarkCategorySchema.safeParse({ category: 'kahve' }).success).toBe(true);
    expect(benchmarkCategorySchema.safeParse({ category: 'demo-cafe' }).success).toBe(false);
    expect(benchmarkCategorySchema.safeParse({ category: null }).success).toBe(true);
  });
});
