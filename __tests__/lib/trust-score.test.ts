/**
 * Trust Score testleri: tier eşikleri + sinyal-bazlı işaretleme/skor düşüşü
 * (spam sıklığı, hedefli kötüleme, kronik negatiflik) ve iyi davranış toparlaması.
 */
const mockUserFindUnique = jest.fn();
const mockFeedbackCount = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    feedback: { count: (...args: unknown[]) => mockFeedbackCount(...args) },
  },
}));

import {
  evaluateTrustOnFeedback,
  trustTierFromScore,
  PER_DEALER_DAILY_FEEDBACK_SOFT_LIMIT,
} from '@/lib/trust-score';

beforeEach(() => {
  mockUserFindUnique.mockReset();
  mockFeedbackCount.mockReset();
});

/**
 * evaluateTrustOnFeedback, Promise.all ile 5 sorgu yapar (kullanıcı + 4 count).
 * Count sırası: [dealerToday, dealerLow30d, globalTotal30d, globalLow30d].
 */
function mockCounts(counts: {
  dealerToday: number;
  dealerLow30d: number;
  globalTotal30d: number;
  globalLow30d: number;
}) {
  mockFeedbackCount
    .mockResolvedValueOnce(counts.dealerToday)
    .mockResolvedValueOnce(counts.dealerLow30d)
    .mockResolvedValueOnce(counts.globalTotal30d)
    .mockResolvedValueOnce(counts.globalLow30d);
}

describe('trustTierFromScore', () => {
  it('skor eşiklerini doğru kademeye çevirir', () => {
    expect(trustTierFromScore(100)).toBe('trusted');
    expect(trustTierFromScore(80)).toBe('trusted');
    expect(trustTierFromScore(79)).toBe('neutral');
    expect(trustTierFromScore(55)).toBe('neutral');
    expect(trustTierFromScore(54)).toBe('watch');
    expect(trustTierFromScore(30)).toBe('watch');
    expect(trustTierFromScore(29)).toBe('low');
    expect(trustTierFromScore(0)).toBe('low');
  });
});

describe('evaluateTrustOnFeedback', () => {
  it('temiz/normal yorum: işaretlenmez ve skor hafif toparlar', async () => {
    mockUserFindUnique.mockResolvedValue({ trustScore: 90 });
    mockCounts({ dealerToday: 1, dealerLow30d: 0, globalTotal30d: 2, globalLow30d: 0 });

    const r = await evaluateTrustOnFeedback({ userId: 'u1', dealerId: 'd1', rating: 5 });

    expect(r.flagged).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.newScore).toBe(92); // +2 iyi davranış
    expect(r.tier).toBe('trusted');
    expect(r.overSoftLimit).toBe(false);
  });

  it('spam sıklığı: aynı işletmeye limit üstü yorum işaretlenir ve skor düşer', async () => {
    mockUserFindUnique.mockResolvedValue({ trustScore: 100 });
    mockCounts({
      dealerToday: PER_DEALER_DAILY_FEEDBACK_SOFT_LIMIT + 1,
      dealerLow30d: 0,
      globalTotal30d: 4,
      globalLow30d: 0,
    });

    const r = await evaluateTrustOnFeedback({ userId: 'u1', dealerId: 'd1', rating: 4 });

    expect(r.overSoftLimit).toBe(true);
    expect(r.flagged).toBe(true);
    expect(r.reason).toContain('çok yorum');
    expect(r.newScore).toBe(88); // -12
  });

  it('hedefli kötüleme: aynı işletmeye tekrar tekrar düşük puan işaretlenir', async () => {
    mockUserFindUnique.mockResolvedValue({ trustScore: 100 });
    mockCounts({ dealerToday: 1, dealerLow30d: 3, globalTotal30d: 4, globalLow30d: 3 });

    const r = await evaluateTrustOnFeedback({ userId: 'u1', dealerId: 'd1', rating: 1 });

    expect(r.flagged).toBe(true);
    expect(r.reason).toContain('düşük puan');
    expect(r.newScore).toBe(90); // -10
  });

  it('kronik negatiflik: genelde aşırı düşük-puan oranı skoru düşürür', async () => {
    mockUserFindUnique.mockResolvedValue({ trustScore: 100 });
    // dealerLow30d=2 (<3, hedefli tetiklenmez), global 8/10 = %80 >= %70
    mockCounts({ dealerToday: 1, dealerLow30d: 2, globalTotal30d: 10, globalLow30d: 8 });

    const r = await evaluateTrustOnFeedback({ userId: 'u1', dealerId: 'd1', rating: 2 });

    expect(r.flagged).toBe(true);
    expect(r.reason).toContain('düşük-puan oranı');
    expect(r.newScore).toBe(92); // -8
  });

  it('düşük güven kademesindeki kullanıcının düşük puanı sinyal olmasa da işaretlenir', async () => {
    mockUserFindUnique.mockResolvedValue({ trustScore: 25 }); // low tier
    mockCounts({ dealerToday: 1, dealerLow30d: 0, globalTotal30d: 1, globalLow30d: 0 });

    const r = await evaluateTrustOnFeedback({ userId: 'u1', dealerId: 'd1', rating: 1 });

    expect(r.newScore).toBe(27); // 25 + 2 (iyi davranış, sinyal yok)
    expect(r.tier).toBe('low'); // 27 < 30 => low
    expect(r.flagged).toBe(true); // düşük kademe + düşük puan -> işaretle
  });

  it('skor 0-100 aralığında kalır (taban)', async () => {
    mockUserFindUnique.mockResolvedValue({ trustScore: 5 });
    mockCounts({
      dealerToday: PER_DEALER_DAILY_FEEDBACK_SOFT_LIMIT + 1, // -12
      dealerLow30d: 3, // -10
      globalTotal30d: 10,
      globalLow30d: 8, // -8
    });

    const r = await evaluateTrustOnFeedback({ userId: 'u1', dealerId: 'd1', rating: 1 });

    expect(r.newScore).toBe(0); // 5 - 30 = -25 -> 0
    expect(r.tier).toBe('low');
  });
});
