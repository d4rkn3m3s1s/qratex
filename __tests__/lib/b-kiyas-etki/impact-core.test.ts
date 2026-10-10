/**
 * Bayi Etki saf hesap katmanı — ROI #1/#2/#13/#15/#36 ve İş sonuçları #1/#2/#3/#17 kapanışları.
 */
import {
  EMPTY_FEEDBACK,
  EMPTY_VISITS,
  basketAssumption,
  buildClosedLoop,
  buildKpis,
  buildNextSteps,
  buildTrend,
  goalProgress,
  impactSettingsSchema,
  mondayOf,
  normalizeImpactSettings,
  parseImpactSearch,
} from '@/lib/dealer-impact/core';
import { DEFAULT_RETURN_WINDOW } from '@/lib/dealer-impact/types';

describe('kapanan döngü', () => {
  const rows = [
    { replied: true, matured: true, customers: 10, returned: 6, revenue: 1200 },
    { replied: false, matured: true, customers: 10, returned: 2, revenue: 300 },
    { replied: true, matured: false, customers: 4, returned: 0, revenue: 0 },
  ];

  it('fark, ek ziyaret ve ek ciro', () => {
    const loop = buildClosedLoop(rows, 30, { from: '2026-08-01', to: '2026-09-01' }, 250);
    expect(loop.status).toBe('ok');
    expect(loop.replied.rate).toBe(60);
    expect(loop.unreplied.rate).toBe(20);
    expect(loop.liftPoints).toBe(40);
    expect(loop.estimatedExtraVisits).toBe(4);
    expect(loop.estimatedExtraRevenue).toBe(1000);
    expect(loop.pending).toBe(4);
    expect(loop.returnedRevenue).toBe(1200);
  });

  it('sepet yoksa ciro tahmini yapılmaz (uydurma yok)', () => {
    expect(buildClosedLoop(rows, 30, null, null).estimatedExtraRevenue).toBeNull();
  });

  it('kolda < 5 müşteri → yetersiz', () => {
    const loop = buildClosedLoop([{ replied: true, matured: true, customers: 3, returned: 3, revenue: 0 }], 30, null, 100);
    expect(loop.status).toBe('insufficient');
    expect(loop.liftPoints).toBeNull();
  });

  it('kohort boş → no_cohort', () => {
    expect(buildClosedLoop([], 30, null, 100).status).toBe('no_cohort');
  });
});

describe('KPI', () => {
  const base = {
    fb: { ...EMPTY_FEEDBACK, n: 20, replied: 10, negative: 4 },
    fbCmp: { ...EMPTY_FEEDBACK, n: 20, replied: 5, negative: 4 },
    visits: { ...EMPTY_VISITS, customers: 10, returning: 4 },
    visitsCmp: null,
    remedy: { delivered: 4, accepted: 2 },
    remedyCmp: null,
    actionsClosed: 3,
    actionsClosedCmp: 0,
    trend: [],
  };

  it('oran değişimi yüzde puanı, yön bilgisiyle', () => {
    const k = buildKpis(base);
    expect(k.replyRate.value).toBe(50);
    expect(k.replyRate.delta).toEqual({ value: 25, kind: 'points', goodDirection: 'up' });
    expect(k.negativeShare.delta?.goodDirection).toBe('down');
  });

  it('küçük örneklemde değişim gösterilmez', () => {
    const k = buildKpis({ ...base, fbCmp: { ...EMPTY_FEEDBACK, n: 3, replied: 1 } });
    expect(k.replyRate.delta).toBeNull();
  });

  it('veri yoksa null (0 değil); tutar yoksa ciro null', () => {
    const k = buildKpis({ ...base, fb: EMPTY_FEEDBACK, visits: EMPTY_VISITS, remedy: { delivered: 0, accepted: 0 } });
    expect(k.replyRate.value).toBeNull();
    expect(k.returningRate.value).toBeNull();
    expect(k.recoveryRate.value).toBeNull();
    expect(k.revenue.value).toBeNull();
  });

  it('önceki değer 0 iken göreli değişim üretilmez', () => {
    expect(buildKpis(base).actionsClosed.delta).toBeNull();
  });
});

describe('varsayımlar ve hedefler', () => {
  it('sepet: özel > gözlenen > yok', () => {
    const visits = { ...EMPTY_VISITS, visits: 10, amountN: 4, revenue: 400 };
    expect(basketAssumption({ ...normalizeImpactSettings(null), basketTry: 150 }, visits)).toMatchObject({ value: 150, source: 'custom', observedAvg: 100, amountCoverage: 40 });
    expect(basketAssumption(normalizeImpactSettings(null), visits)).toMatchObject({ value: 100, source: 'observed' });
    expect(basketAssumption(normalizeImpactSettings(null), EMPTY_VISITS)).toMatchObject({ value: null, source: 'none' });
  });

  it('bozuk kayıtlı ayar varsayılana döner', () => {
    const s = normalizeImpactSettings({ returnWindowDays: 999, basketTry: -5, goals: { replyRate: 500, negativeShare: 10 } });
    expect(s.returnWindowDays).toBe(DEFAULT_RETURN_WINDOW);
    expect(s.basketTry).toBeNull();
    expect(s.goals).toEqual({ negativeShare: 10 });
  });

  it('ayar şeması sıkı', () => {
    expect(impactSettingsSchema.safeParse({ returnWindowDays: 30, basketTry: null, goals: {} }).success).toBe(true);
    expect(impactSettingsSchema.safeParse({ returnWindowDays: 45, basketTry: null, goals: {} }).success).toBe(false);
    expect(impactSettingsSchema.safeParse({ returnWindowDays: 30, basketTry: null, goals: {}, extra: 1 }).success).toBe(false);
  });

  it('hedef tuttu/tutmadı yönü doğru', () => {
    const k = buildKpis({
      fb: { ...EMPTY_FEEDBACK, n: 20, replied: 18, negative: 6, medianReplySec: 7200 },
      fbCmp: null,
      visits: EMPTY_VISITS,
      visitsCmp: null,
      remedy: { delivered: 0, accepted: 0 },
      remedyCmp: null,
      actionsClosed: 0,
      actionsClosedCmp: null,
      trend: [],
    });
    const g = goalProgress({ ...normalizeImpactSettings(null), goals: { replyRate: 80, negativeShare: 20, medianReplyHours: 1, returningRate: 30 } }, k);
    expect(g.find((x) => x.key === 'replyRate')?.met).toBe(true);
    expect(g.find((x) => x.key === 'negativeShare')?.met).toBe(false);
    expect(g.find((x) => x.key === 'medianReplyHours')).toMatchObject({ value: 2, met: false });
    expect(g.find((x) => x.key === 'returningRate')?.met).toBeNull();
  });
});

describe('trend ve sonraki adımlar', () => {
  it('Pazartesi hizalı haftalar; boş hafta puanı null', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    const t = buildTrend({ from: '2026-10-01', to: '2026-10-11' }, { feedback: [{ week: '2026-10-05', n: 2, ratingSum: 9, replied: 1, negative: 0 }], visits: [], actions: [] });
    expect(t.map((p) => p.week)).toEqual(['2026-09-28', '2026-10-05']);
    expect(t[0].avgRating).toBeNull();
    expect(t[1].avgRating).toBe(4.5);
  });

  it('sonraki adımlar gerçek iş yükünden', () => {
    const steps = buildNextSteps({ open: 3, overdue: 1, awaitingApproval: 0, unrepliedNegative: 2 }, basketAssumption(normalizeImpactSettings(null), EMPTY_VISITS), EMPTY_VISITS, true);
    expect(steps.map((s) => s.kind)).toEqual(['unreplied_negative', 'overdue_actions']);
  });

  it('dönem URL ayrıştırma', () => {
    const q = parseImpactSearch(new URLSearchParams('period=last7&compare=none'), '2026-10-11');
    expect(q.preset).toBe('last7');
    expect(q.compareRange).toBeNull();
  });
});
