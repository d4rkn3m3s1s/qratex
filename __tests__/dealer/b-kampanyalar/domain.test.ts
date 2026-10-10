/**
 * Kampanya merkezi — saf alan modeli (denetim: docs/audit/2026-10-08/bayi/dealer_campaigns.md).
 *  - Teslim planı: izin → frekans tavanı → 1000 sınırı → deterministik kontrol grubu.
 *  - Huni ölçümü: pencere, ziyaret/harcama, oran (payda 0 → null, "%0" uydurulmaz).
 *  - Segment: eski "sadık = aktif" çakışması yok; `at_risk` → `risk`.
 */
import {
  FREQUENCY_CAP,
  HOLDOUT_MIN_POOL,
  groupOutcome,
  holdoutBucket,
  normalizeSegment,
  parseListTab,
  parseWindow,
  pct,
  planCampaignDelivery,
  pointsDelta,
  wasSent,
  type ActivityEvent,
} from '@/components/dealer/b-kampanyalar/domain';

const ids = (n: number, prefix = 'u') => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`);

describe('planCampaignDelivery', () => {
  it('tercihi kapalı olanı atlar; kanalları ayrı tutar', () => {
    const plan = planCampaignDelivery({
      campaignId: 'c1',
      orderedCandidates: ['a', 'b', 'c', 'a'],
      appUserIds: ['a', 'b'],
      pushUserIds: ['a'],
      recentCounts: new Map(),
      holdoutPct: 0,
    });
    expect(plan.candidateCount).toBe(3);
    expect(plan.recipientIds).toEqual(['a', 'b']);
    expect(plan.appUserIds).toEqual(['a', 'b']);
    expect(plan.pushUserIds).toEqual(['a']);
    expect(plan.optedOutCount).toBe(1);
    expect(plan.holdoutApplied).toBe(false);
  });

  it(`frekans tavanı: son ${FREQUENCY_CAP.days} günde ${FREQUENCY_CAP.max} ileti alan atlanır`, () => {
    const plan = planCampaignDelivery({
      campaignId: 'c1',
      orderedCandidates: ['a', 'b'],
      appUserIds: ['a', 'b'],
      pushUserIds: [],
      recentCounts: new Map([['a', FREQUENCY_CAP.max], ['b', FREQUENCY_CAP.max - 1]]),
      holdoutPct: 0,
    });
    expect(plan.recipientIds).toEqual(['b']);
    expect(plan.frequencyCappedCount).toBe(1);
  });

  it('1000 sınırı: sıradaki (en yeni ziyaretçiler) alınır, kalan sayılır', () => {
    const all = ids(1200);
    const plan = planCampaignDelivery({
      campaignId: 'c1',
      orderedCandidates: all,
      appUserIds: all,
      pushUserIds: [],
      recentCounts: new Map(),
      holdoutPct: 0,
    });
    expect(plan.recipientIds).toHaveLength(1000);
    expect(plan.recipientIds[0]).toBe(all[0]);
    expect(plan.truncatedCount).toBe(200);
  });

  it('kontrol grubu deterministik ve yaklaşık oranında; küçük havuzda uygulanmaz', () => {
    const pool = ids(1000);
    const input = { campaignId: 'cmp-x', orderedCandidates: pool, appUserIds: pool, pushUserIds: [], recentCounts: new Map<string, number>(), holdoutPct: 10 };
    const a = planCampaignDelivery(input);
    const b = planCampaignDelivery(input);
    expect(a.holdoutApplied).toBe(true);
    expect(a.holdoutIds).toEqual(b.holdoutIds);
    expect(a.holdoutIds.length).toBeGreaterThan(50);
    expect(a.holdoutIds.length).toBeLessThan(150);
    expect(a.recipientIds.length + a.holdoutIds.length).toBe(1000);
    expect(a.recipientIds.some((id) => a.holdoutIds.includes(id))).toBe(false);
    for (const id of a.holdoutIds) expect(holdoutBucket('cmp-x', id)).toBeLessThan(10);

    const small = ids(HOLDOUT_MIN_POOL - 1);
    const s = planCampaignDelivery({ ...input, orderedCandidates: small, appUserIds: small });
    expect(s.holdoutApplied).toBe(false);
    expect(s.holdoutIds).toHaveLength(0);
    expect(s.holdoutPct).toBe(0);
  });

  it('geçersiz kontrol oranı yok sayılır', () => {
    const pool = ids(100);
    const plan = planCampaignDelivery({ campaignId: 'c', orderedCandidates: pool, appUserIds: pool, pushUserIds: [], recentCounts: new Map(), holdoutPct: 37 });
    expect(plan.holdoutApplied).toBe(false);
    expect(plan.recipientIds).toHaveLength(100);
  });
});

describe('ölçüm', () => {
  const sent = Date.UTC(2026, 9, 1);
  const day = 86_400_000;
  const events: ActivityEvent[] = [
    { userId: 'a', at: sent - 2 * day, amount: 100, rating: null },
    { userId: 'a', at: sent + day, amount: 250, rating: null },
    { userId: 'b', at: sent + 2 * day, amount: null, rating: 4 },
    { userId: 'c', at: sent + 3 * day, amount: null, rating: 5, visit: false },
    { userId: 'z', at: sent + day, amount: 999, rating: null },
  ];

  it('pencere içindeki ziyaret/harcama/puan; tüketim yorumu ziyaret sayılmaz; üye olmayan sayılmaz', () => {
    const o = groupOutcome(new Set(['a', 'b', 'c']), events, sent, sent + 14 * day);
    expect(o).toMatchObject({ size: 3, visitors: 2, spenders: 1, spend: 250, ratingCount: 2 });
    const before = groupOutcome(new Set(['a', 'b', 'c']), events, sent - 14 * day, sent);
    expect(before).toMatchObject({ visitors: 1, spend: 100 });
  });

  it('oran: payda 0 → null', () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33.3);
    expect(pointsDelta(40, 25.5)).toBe(14.5);
    expect(pointsDelta(null, 2)).toBeNull();
  });
});

describe('ayrıştırıcılar', () => {
  it('segment: bilinmeyen → null; at_risk → risk', () => {
    expect(normalizeSegment('loyal')).toBe('loyal');
    expect(normalizeSegment('at_risk')).toBe('risk');
    expect(normalizeSegment('weird')).toBeNull();
  });
  it('sekme ve pencere varsayılanları', () => {
    expect(parseListTab('sent')).toBe('sent');
    expect(parseListTab('x')).toBe('drafts');
    expect(parseWindow('30')).toBe(30);
    expect(parseWindow('99')).toBe(14);
  });
  it('gönderilmiş sayılma: arşivde ama gönderim anı varsa', () => {
    expect(wasSent({ status: 'archived', sentAt: '2026-10-01T00:00:00Z' })).toBe(true);
    expect(wasSent({ status: 'scheduled', sentAt: '2026-10-01T00:00:00Z' })).toBe(false);
  });
});
