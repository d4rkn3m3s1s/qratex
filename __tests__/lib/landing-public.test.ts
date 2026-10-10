/**
 * p-landing (/, /neden-qratex, /guven) sunucu mantığı: vitrin istatistikleri, fiyat tablosu,
 * kazanç önizlemesi ve JSON-LD güvenliği. DB yok — Prisma mock.
 */
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));
jest.mock('@/lib/prisma', () => ({ prisma: { settings: { findUnique: jest.fn().mockResolvedValue(null) } } }));
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn().mockResolvedValue(null), redisSetJson: jest.fn() }));

import {
  computePublicStats,
  formatPublicCount,
  formatRating,
  isPublicStats,
  PUBLIC_STATS_THRESHOLDS,
  selectVisibleStats,
  type PublicStats,
  type StatsDb,
} from '@/lib/landing/public-stats-core';
import {
  buildPricingJsonLd,
  formatPlanPrice,
  hasFreePlan,
  intervalSuffix,
  loadPublicPlans,
  lowestPaidPlan,
  normalizePlanFeatures,
  planQuotaLines,
  registerHrefForPlan,
  toPublicPlan,
  type PricingDb,
  type PublicPlan,
} from '@/lib/landing/public-pricing-core';
import { previewFeedbackReward } from '@/lib/landing/earn-preview-core';
import { buildEarnPreview } from '@/lib/landing/earn-preview';
import { getDefaultPointsMatrix } from '@/lib/points-rules';
import { DEFAULT_LEAGUE_RULES } from '@/lib/league-rules-core';
import { CHARACTER_CATEGORIES } from '@/lib/character-categories';
import { FEEDBACK_DAILY_CAP } from '@/lib/economy/caps';
import { breadcrumbJsonLd, faqJsonLd, jsonLdHtml } from '@/lib/landing/seo';

function statsDb(opts: { members?: number; dealers?: number; count?: number; avg?: number | null; last30?: number }) {
  const userCount = jest.fn(async (args: { where: { role: string } }) =>
    args.where.role === 'CUSTOMER' ? opts.members ?? 0 : opts.dealers ?? 0
  );
  const feedbackAggregate = jest.fn(async () => ({ _count: { _all: opts.count ?? 0 }, _avg: { rating: opts.avg ?? null } }));
  const feedbackCount = jest.fn(async () => opts.last30 ?? 0);
  const db = { user: { count: userCount }, feedback: { aggregate: feedbackAggregate, count: feedbackCount } } as unknown as StatsDb;
  return { db, userCount, feedbackAggregate, feedbackCount };
}

describe('computePublicStats — doğru şeyi sayar', () => {
  it('yalnız gerçek tüketici/işletme hesaplarını sayar (demo, anonim, askıdaki hariç)', async () => {
    const { db, userCount } = statsDb({ members: 120, dealers: 9 });
    const s = await computePublicStats(db, new Date('2026-10-10T10:00:00Z'));
    expect(s.members).toBe(120);
    expect(s.businesses).toBe(9);
    const customerWhere = userCount.mock.calls.find((c) => c[0].where.role === 'CUSTOMER')![0].where;
    expect(customerWhere).toEqual({ role: 'CUSTOMER', isDemo: false, anonymizedAt: null, suspendedAt: null });
    const dealerWhere = userCount.mock.calls.find((c) => c[0].where.role === 'DEALER')![0].where;
    expect(dealerWhere).toEqual({ role: 'DEALER', isDemo: false, anonymizedAt: null, suspendedAt: null });
  });

  it('silinen ve demo işletmeye ait geri bildirimleri dışlar; son 30 gün penceresi doğru', async () => {
    const { db, feedbackAggregate, feedbackCount } = statsDb({ count: 500, avg: 4.437, last30: 80 });
    const now = new Date('2026-10-10T10:00:00Z');
    const s = await computePublicStats(db, now);
    const aggArgs = (feedbackAggregate.mock.calls[0] as unknown as [{ where: unknown }])[0];
    expect(aggArgs.where).toEqual({ deletedAt: null, qrCode: { dealer: { isDemo: false } } });
    const countArgs = (feedbackCount.mock.calls[0] as unknown as [{ where: { createdAt: { gte: Date } } }])[0];
    expect(countArgs.where).toMatchObject({ deletedAt: null, qrCode: { dealer: { isDemo: false } } });
    expect(countArgs.where.createdAt.gte.toISOString()).toBe('2026-09-10T10:00:00.000Z');
    expect(s.feedbacks).toBe(500);
    expect(s.feedbacksLast30d).toBe(80);
    expect(s.rating).toBe(4.4);
    expect(s.computedAt).toBe(now.toISOString());
  });

  it('örneklem yetersizse ortalama UYDURULMAZ (eski 4.9 yedeği yok)', async () => {
    const few = await computePublicStats(statsDb({ count: PUBLIC_STATS_THRESHOLDS.ratingSample - 1, avg: 5 }).db);
    expect(few.rating).toBeNull();
    const none = await computePublicStats(statsDb({ count: 0, avg: null }).db);
    expect(none.rating).toBeNull();
    expect(none.ratingCount).toBe(0);
  });
});

describe('vitrin biçimleme ve eşikler', () => {
  it('formatPublicCount gerçek değerden büyük göstermez; yuvarlarsa "+" ekler', () => {
    expect(formatPublicCount(847)).toBe('847');
    expect(formatPublicCount(1200)).toBe('1.200');
    expect(formatPublicCount(1284)).toBe('1.200+');
    expect(formatPublicCount(12_480)).toBe('12.000+');
    expect(formatPublicCount(1_250_000)).toBe('1.200.000+');
    expect(formatPublicCount(1284, 'en')).toBe('1,200+');
    expect(formatPublicCount(-5)).toBe('0');
    expect(formatPublicCount(Number.NaN)).toBe('0');
  });

  it('formatRating yerel ondalık ayırıcı kullanır', () => {
    expect(formatRating(4.6)).toBe('4,6');
    expect(formatRating(4.6, 'en')).toBe('4.6');
    expect(formatRating(5)).toBe('5,0');
  });

  const base: PublicStats = {
    members: 60,
    businesses: 4,
    feedbacks: 400,
    feedbacksLast30d: 10,
    rating: 4.5,
    ratingCount: 400,
    computedAt: '2026-10-10T10:00:00.000Z',
  };

  it('selectVisibleStats yalnız eşiği geçenleri, istenen sırayla döndürür', () => {
    const v = selectVisibleStats(base, ['members', 'businesses', 'feedbacks', 'feedbacksLast30d', 'rating']);
    expect(v.map((s) => s.key)).toEqual(['members', 'feedbacks', 'rating']);
    expect(v.find((s) => s.key === 'rating')!.display).toBe('4,5');
  });

  it('istatistik yoksa ya da ortalama null ise hiçbir şey uydurulmaz', () => {
    expect(selectVisibleStats(null, ['members'])).toEqual([]);
    expect(selectVisibleStats({ ...base, rating: null }, ['rating'])).toEqual([]);
  });

  it('isPublicStats eski/bozuk önbellek değerini reddeder', () => {
    expect(isPublicStats(base)).toBe(true);
    expect(isPublicStats({ users: 10, businesses: 2, feedbacks: 5, rating: 4.9 })).toBe(false);
    expect(isPublicStats({ ...base, members: -1 })).toBe(false);
    expect(isPublicStats(null)).toBe(false);
  });
});

describe('herkese açık fiyat tablosu — tek kaynak PricingPlan', () => {
  const row = {
    id: 'p1',
    name: ' Başlangıç ',
    description: '',
    price: 299,
    currency: 'try',
    interval: 'monthly',
    features: ['Öncelikli destek', '<b>AI</b> özet', 42, '', null],
    maxQRCodes: 10,
    maxBranches: null,
    isPopular: true,
  };

  it('normalizePlanFeatures metin dışını ve HTML etiketlerini ayıklar, en fazla 8', () => {
    expect(normalizePlanFeatures(row.features)).toEqual(['Öncelikli destek', 'AI özet']);
    expect(normalizePlanFeatures('x')).toEqual([]);
    expect(normalizePlanFeatures(Array.from({ length: 12 }, (_, i) => `f${i}`))).toHaveLength(8);
  });

  it('toPublicPlan alanları güvenli biçime getirir', () => {
    const p = toPublicPlan(row);
    expect(p).toMatchObject({ id: 'p1', name: 'Başlangıç', description: null, price: 299, currency: 'TRY', isPopular: true });
    expect(toPublicPlan({ ...row, price: -3 }).price).toBe(0);
  });

  it('loadPublicPlans yalnız satıştaki (aktif + arşivsiz) planları admin sırasıyla okur', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const plans = await loadPublicPlans({ pricingPlan: { findMany } } as unknown as PricingDb);
    expect(plans).toHaveLength(1);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isActive: true, archivedAt: null });
    expect(args.orderBy).toEqual([{ order: 'asc' }, { price: 'asc' }]);
    expect(args.select.stripePriceId).toBeUndefined();
  });

  it('fiyat, dönem ve uygulanan kotalar', () => {
    expect(formatPlanPrice(299, 'TRY')).toMatch(/299/);
    expect(formatPlanPrice(299.9, 'TRY')).toMatch(/299,90/);
    expect(intervalSuffix('monthly')).toBe('/ay');
    expect(intervalSuffix('yearly', 'en')).toBe('/yr');
    expect(planQuotaLines({ maxQRCodes: 10, maxBranches: null })).toEqual(['10 QR kod', 'Sınırsız şube']);
    expect(planQuotaLines({ maxQRCodes: null, maxBranches: 1 }, 'en')).toEqual(['Unlimited QR codes', '1 branch']);
  });

  const plan = (over: Partial<PublicPlan>): PublicPlan => ({
    id: 'x',
    name: 'X',
    description: null,
    price: 0,
    currency: 'TRY',
    interval: 'monthly',
    features: [],
    maxQRCodes: null,
    maxBranches: null,
    isPopular: false,
    ...over,
  });

  it('en düşük ücretli plan ve ücretsiz plan tespiti', () => {
    const list = [plan({ id: 'free' }), plan({ id: 'pro', price: 699 }), plan({ id: 'start', price: 299 }), plan({ id: 'life', price: 99, interval: 'lifetime' })];
    expect(lowestPaidPlan(list)?.id).toBe('start');
    expect(hasFreePlan(list)).toBe(true);
    expect(hasFreePlan([plan({ price: 10 })])).toBe(false);
    expect(lowestPaidPlan([])).toBeNull();
  });

  it('plan CTA işletme rolünü, plan kimliğini ve faturalama dönüşünü taşır', () => {
    const href = registerHrefForPlan('abc123');
    const url = new URL(href, 'https://x.test');
    expect(url.pathname).toBe('/auth/register');
    expect(url.searchParams.get('role')).toBe('DEALER');
    expect(url.searchParams.get('plan')).toBe('abc123');
    expect(url.searchParams.get('src')).toBe('pricing');
    expect(url.searchParams.get('callbackUrl')).toBe('/dealer/billing?plan=abc123');
  });

  it('JSON-LD fiyat kartlarıyla aynı veriden; uydurma geçerlilik tarihi yok', () => {
    expect(buildPricingJsonLd([], { base: 'https://x.test', pagePath: '/neden-qratex' })).toBeNull();
    const ld = buildPricingJsonLd([plan({ id: 's', name: 'Start', price: 299 })], { base: 'https://x.test', pagePath: '/neden-qratex#fiyatlar' })!;
    const offer = (ld.itemListElement[0].item as { offers: Record<string, unknown> }).offers;
    expect(offer.price).toBe('299.00');
    expect(offer.priceCurrency).toBe('TRY');
    expect(offer.url).toBe('https://x.test/neden-qratex#fiyatlar');
    expect(offer).not.toHaveProperty('priceValidUntil');
  });
});

describe('kazanç önizlemesi — ekonominin kendi kuralı', () => {
  const matrix = getDefaultPointsMatrix();

  it('previewFeedbackReward ekonomideki eşik kuralını uygular (boşluklar sayılmaz)', () => {
    const fb = matrix.feedback;
    expect(previewFeedbackReward('kısa', fb)).toMatchObject({ points: fb.base.points, xp: fb.base.xp, detailed: false });
    expect(previewFeedbackReward(' '.repeat(80), fb).detailed).toBe(false);
    expect(previewFeedbackReward('a'.repeat(fb.longTextThreshold), fb)).toMatchObject({ points: fb.detailed.points, detailed: true });
  });

  it('buildEarnPreview matris, tavan, lig ve karakter kataloğundan türetilir', () => {
    const shuffled = [...DEFAULT_LEAGUE_RULES].reverse();
    const p = buildEarnPreview(matrix, shuffled);
    expect(p.feedback.base).toEqual(matrix.feedback.base);
    expect(p.feedbackDailyCap).toBe(FEEDBACK_DAILY_CAP);
    expect(p.leagues.map((l) => l.minPoints)).toEqual([...DEFAULT_LEAGUE_RULES].map((l) => l.minPoints).sort((a, b) => a - b));
    expect(p.streakMilestones).toHaveLength(3);
    expect(p.streakMilestones[0].days).toBeLessThan(p.streakMilestones[1].days);
    const expectedCount = CHARACTER_CATEGORIES.reduce((sum, c) => sum + c.characterIds.length, 0);
    expect(p.characterCount).toBe(expectedCount);
    expect(p.characterCategories.filter((c) => c.mystery).map((c) => c.key)).toEqual(['gizemli']);
  });

  it('lig kuralı boşsa varsayılan basamaklara düşer', () => {
    expect(buildEarnPreview(matrix, []).leagues).toHaveLength(DEFAULT_LEAGUE_RULES.length);
  });
});

describe('JSON-LD güvenliği', () => {
  it('jsonLdHtml </script> kaçışını engeller ve geçerli JSON kalır', () => {
    const html = jsonLdHtml({ name: '</script><script>alert(1)</script> & co' });
    expect(html).not.toContain('<');
    expect(html).not.toContain('>');
    expect(JSON.parse(html)).toEqual({ name: '</script><script>alert(1)</script> & co' });
  });

  it('faqJsonLd ve breadcrumbJsonLd HTML etiketlerini temizler, URL birleştirir', () => {
    const faq = faqJsonLd([{ q: '<b>Soru</b>?', a: 'Cevap <i>x</i>' }]);
    expect(faq.mainEntity[0].name).toBe('Soru?');
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe('Cevap x');
    const bc = breadcrumbJsonLd('https://x.test/', [
      { name: 'Ana Sayfa', path: '/' },
      { name: 'Güven', path: '/guven' },
    ]);
    expect(bc.itemListElement.map((i) => i.item)).toEqual(['https://x.test', 'https://x.test/guven']);
  });
});
