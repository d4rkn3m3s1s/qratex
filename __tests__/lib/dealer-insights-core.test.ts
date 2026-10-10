import { aggregateInsights, type InsightRow } from '@/lib/dealer-insights/core';

function row(p: Partial<InsightRow>): InsightRow {
  return {
    id: Math.random().toString(36).slice(2),
    source: 'qr',
    rating: 5,
    sentiment: null,
    hasText: false,
    analyzed: false,
    replied: false,
    day: '2026-10-01',
    npsScore: null,
    urgency: null,
    churnRisk: null,
    effort: null,
    intent: null,
    isToxic: false,
    themes: [],
    entities: [],
    emotions: [],
    suggestions: [],
    ...p,
  };
}

const range = { from: '2026-09-12', to: '2026-10-11' };

describe('aggregateInsights (sayıları kod hesaplar)', () => {
  it('boş dönemde sahte sıfır değil null metrik döner', () => {
    const agg = aggregateInsights({ cur: [], prev: null, range, truncated: false, asOf: '2026-10-11T00:00:00Z' });
    expect(agg.sample.total).toBe(0);
    expect(agg.metrics.avgRating.value).toBeNull();
    expect(agg.metrics.nps).toBeNull();
  });

  it('örneklem, ortalama ve CSAT deterministik hesaplanır', () => {
    const cur = [
      row({ rating: 5, hasText: true, analyzed: true, replied: true }),
      row({ rating: 4 }),
      row({ rating: 1, hasText: true, source: 'consumption' }),
    ];
    const agg = aggregateInsights({ cur, prev: null, range, truncated: true, asOf: '2026-10-11T00:00:00Z' });
    expect(agg.sample).toMatchObject({ total: 3, qr: 2, consumption: 1, withText: 2, analyzed: 1, pending: 1, truncated: true });
    expect(agg.metrics.avgRating.value).toBeCloseTo(10 / 3, 1);
    expect(agg.metrics.csat.value).toBeCloseTo((2 / 3) * 100, 0);
  });
});
