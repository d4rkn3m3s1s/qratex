/**
 * Bayi Sağlığı saf skor modeli — denetim bulgularının regresyon testleri
 * (docs/audit/2026-10-08/admin/admin_dealers-health.md Bulgu 1, 2, 4; admin_playbooks.md Bulgu 2, 3).
 */
import {
  EMPTY_REVIEWS,
  HEALTH_BANDS,
  bandFor,
  buildRow,
  computeHealth,
  filterRows,
  paginate,
  parseSortParam,
  platformMeanOf,
  recommend,
  rowsToCsv,
  scoreDealer,
  sortRows,
  summarize,
  type DealerSignals,
} from '@/components/admin/a-bayi-sagligi/domain';
import { GROWTH_PLAYBOOKS, buildPlaybookDrafts } from '@/lib/growth-playbooks';

const noInc = { critical: 0, high: 0, medium: 0, low: 0 };

function sig(over: Partial<DealerSignals> = {}): DealerSignals {
  return {
    dealerId: 'd1',
    label: 'Kafe',
    email: 'k@x.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    fraudStatus: 'clean',
    reviews: { ...EMPTY_REVIEWS },
    prevReviews: { ...EMPTY_REVIEWS },
    prev2ReviewCount: 0,
    consumptions: 0,
    prevConsumptions: 0,
    prev2Consumptions: 0,
    incidents: { ...noInc },
    remedyQueue: 0,
    remedyOverdue: 0,
    remedyOldestHours: null,
    newCustomers: 0,
    returnedCustomers: 0,
    ...over,
  };
}

describe('bant eşikleri (tek kaynak)', () => {
  it('sınırlar', () => {
    expect(bandFor(HEALTH_BANDS.critical - 1)).toBe('critical');
    expect(bandFor(HEALTH_BANDS.critical)).toBe('at_risk');
    expect(bandFor(HEALTH_BANDS.at_risk)).toBe('watch');
    expect(bandFor(HEALTH_BANDS.watch)).toBe('healthy');
  });
});

describe('Bulgu 1 — sessiz bayi sağlıklı görünmez', () => {
  it('etkinliksiz bayi riskli bandına düşer, kalite/yanıt "uygulanamaz"', () => {
    const { current } = scoreDealer(sig(), 4.2);
    expect(current.silent).toBe(true);
    expect(current.score).toBe(50); // yalnız aktivite (0/25) + operasyon (25/25)
    expect(current.band).toBe('at_risk');
    expect(current.components.find((c) => c.key === 'quality')!.points).toBeNull();
    expect(current.components.find((c) => c.key === 'responsiveness')!.points).toBeNull();
    expect(current.replyRate).toBeNull();
  });

  it('aktif ve iyi puanlı bayi sessiz bayinin ÜSTÜNDE', () => {
    const active = scoreDealer(
      sig({ reviews: { n: 20, ratingSum: 84, replied: 8, negative: 1 }, consumptions: 60, prevConsumptions: 55, prevReviews: { n: 18, ratingSum: 75, replied: 7, negative: 1 } }),
      4.2
    ).current;
    const silent = scoreDealer(sig(), 4.2).current;
    expect(active.score).toBeGreaterThan(silent.score);
    expect(active.band === 'healthy' || active.band === 'watch').toBe(true);
  });

  it('aktivite düşüşü cezalandırılır', () => {
    const steady = computeHealth({ reviews: EMPTY_REVIEWS, activity: 50, prevActivity: 50, incidents: noInc, remedyQueue: 0, remedyOverdue: 0, fraudStatus: 'clean' }, 4);
    const halved = computeHealth({ reviews: EMPTY_REVIEWS, activity: 25, prevActivity: 50, incidents: noInc, remedyQueue: 0, remedyOverdue: 0, fraudStatus: 'clean' }, 4);
    expect(halved.score).toBeLessThan(steady.score);
    expect(halved.activityRatio).toBe(0.5);
  });
});

describe('Bulgu 4 — küçük örneklem yumuşatılır', () => {
  it('tek 1 yıldızlı yorum skoru çökertmez, güven düşük', () => {
    const one = computeHealth(
      { reviews: { n: 1, ratingSum: 1, replied: 0, negative: 1 }, activity: 10, prevActivity: 10, incidents: noInc, remedyQueue: 0, remedyOverdue: 0, fraudStatus: 'clean' },
      4
    );
    expect(one.smoothedRating).toBe(3.5);
    expect(one.confidence).toBe('low');
    expect(one.score).toBeGreaterThanOrEqual(HEALTH_BANDS.at_risk);
  });

  it('olay önem derecesine ve bekleyen telafiye göre ceza', () => {
    const base = { reviews: EMPTY_REVIEWS, activity: 10, prevActivity: 10, remedyQueue: 0, remedyOverdue: 0, fraudStatus: 'clean' };
    const low = computeHealth({ ...base, incidents: { ...noInc, low: 1 } }, 4);
    const crit = computeHealth({ ...base, incidents: { ...noInc, critical: 1 } }, 4);
    expect(crit.score).toBeLessThan(low.score);
    const overdue = computeHealth({ ...base, incidents: noInc, remedyQueue: 2, remedyOverdue: 2 }, 4);
    expect(overdue.components.find((c) => c.key === 'operations')!.points).toBe(25 - 6 - 6);
  });

  it('fraud cezası düşülür', () => {
    const base = { reviews: EMPTY_REVIEWS, activity: 10, prevActivity: 10, incidents: noInc, remedyQueue: 0, remedyOverdue: 0 };
    expect(computeHealth({ ...base, fraudStatus: 'shadow_ban' }, 4).score).toBe(70);
    expect(computeHealth({ ...base, fraudStatus: 'flagged' }, 4).fraudPenalty).toBe(15);
  });

  it('platform ortalaması iki kanalın toplamından; veri yoksa 4', () => {
    expect(platformMeanOf([])).toBe(4);
    expect(platformMeanOf([sig({ reviews: { n: 2, ratingSum: 8, replied: 0, negative: 0 } }), sig({ reviews: { n: 2, ratingSum: 6, replied: 0, negative: 0 } })])).toBe(3.5);
  });
});

describe('önceki dönem farkı', () => {
  it('önceki dönemde etkinlik yoksa delta null', () => {
    const r = buildRow(sig({ consumptions: 5 }), 4, 0);
    expect(r.delta).toBeNull();
  });
  it('kötüleşen bayi negatif delta', () => {
    const r = buildRow(
      sig({
        reviews: { n: 10, ratingSum: 20, replied: 0, negative: 8 },
        prevReviews: { n: 10, ratingSum: 45, replied: 9, negative: 0 },
        consumptions: 10,
        prevConsumptions: 30,
        prev2Consumptions: 30,
        prev2ReviewCount: 10,
      }),
      4,
      0
    );
    expect(r.delta).not.toBeNull();
    expect(r.delta!).toBeLessThan(-10);
    expect(r.topLoss).not.toBeNull();
  });
});

describe('bağlamlı öneriler', () => {
  it('düşük NPS → low_nps_churn; kanıt sayılarıyla', () => {
    const s = sig({ reviews: { n: 10, ratingSum: 22, replied: 2, negative: 6 }, consumptions: 10, prevConsumptions: 10 });
    const { current } = scoreDealer(s, 4);
    const recs = recommend(s, current);
    const pb = recs.find((r) => r.kind === 'playbook' && r.id === 'low_nps_churn');
    expect(pb).toBeDefined();
    expect(pb!.evidence.negativePct).toBe(60);
  });
  it('yeni müşteri geri dönmüyor → first_week_dropoff', () => {
    const s = sig({ newCustomers: 10, returnedCustomers: 1, consumptions: 15, prevConsumptions: 10 });
    expect(recommend(s, scoreDealer(s, 4).current).some((r) => r.id === 'first_week_dropoff')).toBe(true);
  });
  it('çok ziyaret az yorum → silent_happy', () => {
    const s = sig({ consumptions: 40, prevConsumptions: 40, reviews: { n: 2, ratingSum: 10, replied: 2, negative: 0 } });
    expect(recommend(s, scoreDealer(s, 4).current).some((r) => r.id === 'silent_happy')).toBe(true);
  });
  it('sessiz bayi → reactivate aksiyonu; yüksek öncelik önce', () => {
    const s = sig({ prevConsumptions: 12, remedyQueue: 1, remedyOverdue: 1, remedyOldestHours: 80 });
    const recs = recommend(s, scoreDealer(s, 4).current);
    expect(recs[0]).toMatchObject({ kind: 'action', id: 'reactivate', priority: 'high' });
    expect(recs.some((r) => r.id === 'clear_remedy')).toBe(true);
  });
  it('sinyal yoksa öneri yok', () => {
    const s = sig({ consumptions: 5, prevConsumptions: 5, reviews: { n: 5, ratingSum: 23, replied: 5, negative: 0 } });
    expect(recommend(s, scoreDealer(s, 4).current)).toEqual([]);
  });
});

describe('liste: filtre, sıralama, sayfa, özet, CSV', () => {
  const rows = [
    buildRow(sig({ dealerId: 'a', label: 'Işık Kafe' }), 4, 0),
    buildRow(sig({ dealerId: 'b', label: 'Bal', consumptions: 10, prevConsumptions: 10, fraudStatus: 'flagged' }), 4, 2),
    buildRow(sig({ dealerId: 'c', label: 'Cam', consumptions: 10, prevConsumptions: 10, incidents: { ...noInc, critical: 2 } }), 4, 0),
  ];
  it('Türkçe katlamalı arama', () => {
    expect(filterRows(rows, { q: 'ışık' }).map((r) => r.dealerId)).toEqual(['a']);
    expect(filterRows(rows, { q: 'ISIK' }).map((r) => r.dealerId)).toEqual(['a']);
  });
  it('bayrak süzgeçleri', () => {
    expect(filterRows(rows, { flag: 'silent' }).map((r) => r.dealerId)).toEqual(['a']);
    expect(filterRows(rows, { flag: 'fraud' }).map((r) => r.dealerId)).toEqual(['b']);
    expect(filterRows(rows, { flag: 'csm_open' }).map((r) => r.dealerId)).toEqual(['b']);
    expect(filterRows(rows, { flag: 'incidents' }).map((r) => r.dealerId)).toEqual(['c']);
  });
  it('varsayılan sıralama en kötü üstte; null değerler sona', () => {
    const sorted = sortRows(rows, parseSortParam(null));
    expect(sorted[0].score).toBeLessThanOrEqual(sorted[1].score);
    const byDelta = sortRows(rows, parseSortParam('delta.desc'));
    expect(byDelta[byDelta.length - 1].delta).toBeNull();
    expect(parseSortParam('evil.desc').key).toBe('score');
  });
  it('sayfalama sınırları ve toplam', () => {
    expect(paginate(rows, 99, 10)).toMatchObject({ page: 1, total: 3 });
    expect(paginate(rows, 1, 7).size).toBe(20);
  });
  it('özet bant sayıları evrenin tamamı', () => {
    const s = summarize(rows);
    expect(Object.values(s.bands).reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.silent).toBe(1);
  });
  it('CSV: BOM, başlık, formül enjeksiyonu etkisiz', () => {
    const evil = buildRow(sig({ dealerId: 'e', label: '=HYPERLINK("x")' }), 4, 0);
    const csv = rowsToCsv([evil], 30);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Geri bildirim (30 g)');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('playbook taslağı müşteri dilinde (admin_playbooks Bulgu 2, 3)', () => {
  it('iç talimat, playbook kimliği ve "churn" müşteri metnine sızmaz; segment tanımdan gelir', () => {
    for (const pb of GROWTH_PLAYBOOKS) {
      const { campaign } = buildPlaybookDrafts(pb, { dealerLabel: 'Ada Kafe' });
      expect(campaign.title).toContain('Ada Kafe');
      expect(campaign.message).not.toContain(pb.id);
      expect(`${campaign.title} ${campaign.message}`.toLowerCase()).not.toMatch(/churn|playbook|nps/);
      for (const a of pb.dealerActions) expect(campaign.message).not.toContain(a);
      expect(campaign.targetSegment).toBe(pb.segment);
    }
    expect(GROWTH_PLAYBOOKS.find((p) => p.id === 'first_week_dropoff')!.segment).toBe('new');
  });
});
