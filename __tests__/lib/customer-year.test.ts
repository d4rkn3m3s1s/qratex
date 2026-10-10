/**
 * Yılım saf kuralları: İstanbul dönem sınırları, varsayılan dönem (Ocak–15 Şubat → geçen yıl),
 * dönem doğrulama, seri/mod/oran/kova/ritim türetmeleri, slayt planı ve paylaşım kartı içeriği.
 */
import {
  availableMonths,
  availableYears,
  defaultPeriod,
  isPeriodClosed,
  periodBounds,
  periodKey,
  previousPeriod,
  resolvePeriod,
  weekdayOfDayKey,
} from '@/lib/customer-year/period';
import { bucketize, longestDayStreak, mostGivenRating, replyRate, rhythmOf, trimQuote } from '@/lib/customer-year/derive';
import { YearQuerySchema, YearSummarySchema, type YearSummary } from '@/lib/customer-year/contract';
import { buildSlides } from '@/components/customer/m-yilim/slides-model';
import { buildShareCardData } from '@/components/customer/m-yilim/share-card';
import { getYearCopy } from '@/components/customer/m-yilim/copy';

const member = new Date('2024-05-20T10:00:00Z');

describe('period (Europe/Istanbul)', () => {
  it('yıl sınırları İstanbul gece yarısıdır (UTC 21:00)', () => {
    const { start, end } = periodBounds({ year: 2026, month: null });
    expect(start.toISOString()).toBe('2025-12-31T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });

  it('1 Ocak 01:30 (İstanbul) yeni yıla düşer — eski UTC hatası yok', () => {
    const t = new Date('2025-12-31T22:30:00Z'); // İstanbul 2026-01-01 01:30
    const y2026 = periodBounds({ year: 2026, month: null });
    expect(t >= y2026.start && t < y2026.end).toBe(true);
  });

  it('ay sınırları ve önceki dönem', () => {
    const { start, end } = periodBounds({ year: 2026, month: 3 });
    expect(start.toISOString()).toBe('2026-02-28T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-31T21:00:00.000Z');
    expect(previousPeriod({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
    expect(previousPeriod({ year: 2026, month: null })).toEqual({ year: 2025, month: null });
    expect(periodKey({ year: 2026, month: 3 })).toBe('2026-03');
  });

  it('varsayılan: 1 Ocak – 15 Şubat arası geçen yıl, sonrası bu yıl', () => {
    expect(defaultPeriod(new Date('2027-01-02T09:00:00Z'), member)).toEqual({ year: 2026, month: null });
    expect(defaultPeriod(new Date('2027-02-15T12:00:00Z'), member)).toEqual({ year: 2026, month: null });
    expect(defaultPeriod(new Date('2027-02-16T12:00:00Z'), member)).toEqual({ year: 2027, month: null });
    // Bu yıl üye olan kullanıcıya geçen yıl önerilmez.
    expect(defaultPeriod(new Date('2027-01-05T09:00:00Z'), new Date('2027-01-03T09:00:00Z'))).toEqual({ year: 2027, month: null });
  });

  it('seçilebilir yıllar/aylar üyelik ve bugünle sınırlı', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(availableYears(member, now)).toEqual([2026, 2025, 2024]);
    expect(availableMonths(2026, member, now)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(availableMonths(2024, member, now)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('resolvePeriod: geçersiz/gelecek/üyelik öncesi → varsayılana düşer', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(resolvePeriod({ year: '2026', month: '3' }, now, member)).toEqual({ period: { year: 2026, month: 3 }, adjusted: false });
    expect(resolvePeriod({ year: '2031' }, now, member)).toEqual({ period: { year: 2026, month: null }, adjusted: true });
    expect(resolvePeriod({ year: '2026', month: '11' }, now, member)).toEqual({ period: { year: 2026, month: null }, adjusted: true });
    expect(resolvePeriod({ year: '2024', month: '2' }, now, member)).toEqual({ period: { year: 2024, month: null }, adjusted: true });
    expect(resolvePeriod({ year: 'abc' }, now, member).adjusted).toBe(true);
    expect(resolvePeriod({}, now, member)).toEqual({ period: { year: 2026, month: null }, adjusted: false });
  });

  it('dönem kapandı mı', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(isPeriodClosed({ year: 2025, month: null }, now)).toBe(true);
    expect(isPeriodClosed({ year: 2026, month: null }, now)).toBe(false);
    expect(isPeriodClosed({ year: 2026, month: 9 }, now)).toBe(true);
  });

  it('hafta günü (0 = Pazartesi)', () => {
    expect(weekdayOfDayKey('2026-10-12')).toBe(0); // Pazartesi
    expect(weekdayOfDayKey('2026-10-11')).toBe(6); // Pazar
  });

  it('sorgu şeması yıl/ay biçimini doğrular', () => {
    expect(YearQuerySchema.safeParse({ year: '2026', month: '3' }).success).toBe(true);
    expect(YearQuerySchema.safeParse({ year: '26' }).success).toBe(false);
    expect(YearQuerySchema.safeParse({ month: '13' }).success).toBe(false);
  });
});

describe('derive', () => {
  it('en uzun ardışık gün serisi (ay/yıl geçişleri dahil)', () => {
    expect(longestDayStreak([])).toBe(0);
    expect(longestDayStreak(['2026-01-05'])).toBe(1);
    expect(longestDayStreak(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-03', '2026-02-28'])).toBe(3);
    expect(longestDayStreak(['2025-12-31', '2026-01-01'])).toBe(2);
  });

  it('en çok verilen puan: eşitlikte yüksek yıldız; boşsa null', () => {
    expect(mostGivenRating([0, 0, 0, 0, 0])).toBeNull();
    expect(mostGivenRating([1, 0, 3, 3, 0])).toBe(4);
    expect(mostGivenRating([0, 0, 0, 1, 7])).toBe(5);
  });

  it('yanıt oranı yorum / yorum birimiyle (denetim bulgu 1 senaryosu)', () => {
    // Aynı işletmeye 10 yorum, 10'u yanıtlandı → %100 (eski kod %10 diyordu).
    expect(replyRate(10, 10)).toBe(100);
    expect(replyRate(3, 8)).toBe(38);
    expect(replyRate(0, 0)).toBeNull();
  });

  it('kovalar: yıl → 12 ay, ay → takvim günleri', () => {
    const rows = [
      { day: '2026-01-03', n: 2, morning: 2, noon: 0, evening: 0, night: 0 },
      { day: '2026-03-15', n: 1, morning: 0, noon: 1, evening: 0, night: 0 },
      { day: '2026-03-31', n: 4, morning: 0, noon: 0, evening: 4, night: 0 },
    ];
    expect(bucketize(rows, { year: 2026, month: null }, 365)).toEqual([2, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const march = bucketize(rows, { year: 2026, month: 3 }, 31);
    expect(march).toHaveLength(31);
    expect(march[14]).toBe(1);
    expect(march[30]).toBe(4);
  });

  it('ritim: zirve dilimi, pay ve hafta günü', () => {
    const r = rhythmOf([
      { day: '2026-10-10', n: 3, morning: 0, noon: 0, evening: 3, night: 0 }, // Cumartesi
      { day: '2026-10-12', n: 1, morning: 1, noon: 0, evening: 0, night: 0 },
    ]);
    expect(r.peak).toBe('evening');
    expect(r.peakShare).toBe(75);
    expect(r.peakWeekday).toBe(5);
    expect(rhythmOf([]).peak).toBeNull();
  });

  it('alıntı kelime sınırında kesilir', () => {
    const long = 'Teşekkürler! '.repeat(30);
    const q = trimQuote(long, 60);
    expect(q.length).toBeLessThanOrEqual(61);
    expect(q.endsWith('…')).toBe(true);
    expect(trimQuote('  Kısa   yanıt  ')).toBe('Kısa yanıt');
  });
});

function baseSummary(over: Partial<YearSummary> = {}): YearSummary {
  const s: YearSummary = {
    period: {
      year: 2026,
      month: null,
      key: '2026',
      startIso: '2025-12-31T21:00:00.000Z',
      endIso: '2026-12-31T21:00:00.000Z',
      isCurrent: true,
      isClosed: false,
      days: 365,
    },
    previous: { year: 2025, month: null, key: '2025' },
    memberSinceIso: member.toISOString(),
    availableYears: [2026, 2025, 2024],
    availableMonths: [1, 2, 3],
    adjusted: false,
    generatedAtIso: '2026-10-10T12:00:00.000Z',
    visits: { total: 0, previousTotal: 0, activeDays: 0, longestStreak: 0, places: 0 },
    favorites: [],
    reviews: { total: 0, previousTotal: 0, average: null, mostGiven: null, distribution: [0, 0, 0, 0, 0] },
    impact: { repliedReviews: 0, replyRate: null, respondingDealers: 0, quote: null },
    badges: { total: 0, items: [] },
    journey: { leagueUps: [], startLeague: null, endLeague: null, peakLeague: null, levelFrom: null, levelTo: null, levelUps: 0 },
    points: { earned: 0 },
    squads: { battles: 0, wins: 0 },
    activity: { unit: 'month', buckets: new Array(12).fill(0) },
    rhythm: { counts: { morning: 0, noon: 0, evening: 0, night: 0 }, peak: null, peakShare: null, peakWeekday: null },
    hasActivity: false,
    ...over,
  };
  return YearSummarySchema.parse(s);
}

describe('slayt planı', () => {
  it('veri olmayan slayt gösterilmez (sıfır anlatılmaz)', () => {
    expect(buildSlides(baseSummary())).toEqual(['intro', 'outro']);
  });

  it('tam veri → tüm slaytlar sırayla', () => {
    const s = baseSummary({
      visits: { total: 12, previousTotal: 4, activeDays: 9, longestStreak: 3, places: 2 },
      favorites: [{ dealerId: 'd1', name: 'Kafe', logo: null, category: 'cafe', visits: 8, reviews: 2 }],
      reviews: { total: 5, previousTotal: 1, average: 4.6, mostGiven: 5, distribution: [0, 0, 0, 2, 3] },
      impact: { repliedReviews: 2, replyRate: 40, respondingDealers: 1, quote: null },
      badges: { total: 1, items: [] },
      journey: { leagueUps: [], startLeague: null, endLeague: { key: 'KOR', name: 'Kor' }, peakLeague: null, levelFrom: null, levelTo: null, levelUps: 0 },
      rhythm: { counts: { morning: 0, noon: 2, evening: 9, night: 0 }, peak: 'evening', peakShare: 82, peakWeekday: 5 },
      hasActivity: true,
    });
    expect(buildSlides(s)).toEqual(['intro', 'visits', 'favorite', 'ratings', 'impact', 'badges', 'journey', 'rhythm', 'outro']);
  });

  it('paylaşım kartı yalnız gerçek, sıfır olmayan değerleri taşır; kişisel metin yok', () => {
    const copy = getYearCopy('tr');
    const s = baseSummary({
      visits: { total: 12, previousTotal: 0, activeDays: 1, longestStreak: 1, places: 1 },
      favorites: [{ dealerId: 'd1', name: 'Kafe Mor', logo: null, category: null, visits: 12, reviews: 0 }],
      impact: { repliedReviews: 1, replyRate: 100, respondingDealers: 1, quote: { dealerId: 'd1', dealerName: 'Kafe Mor', text: 'Gizli yanıt', atIso: null } },
      hasActivity: true,
    });
    const card = buildShareCardData(s, copy);
    expect(card.periodLabel).toBe('2026');
    expect(card.stats).toEqual([{ value: '12', label: 'ziyaret' }]);
    expect(card.rows).toEqual([{ label: 'Favori mekânım', value: 'Kafe Mor' }]);
    expect(JSON.stringify(card)).not.toContain('Gizli yanıt');
  });
});
