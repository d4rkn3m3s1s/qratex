/**
 * Sürpriz rozet otomatik-award mantığı: yalnız hiddenUntilEarned + aktif + koşulu sağlanmış +
 * henüz sahip olunmayan rozetler verilir. custom/bilinmeyen requirement tipi otomatik VERİLMEZ
 * (Didar: gizli rozet kazanılınca açılır; yanlış award ekonomiyi bozar).
 */
const mockBadgeFindMany = jest.fn();
const mockUserBadgeFindMany = jest.fn();
const mockCreateMany = jest.fn();
const mockNotifCreate = jest.fn();
const mockUserFindUnique = jest.fn();
const mockCount = jest.fn();

/**
 * Rozet ekleme + ödül kredisi artık AYNI $transaction içinde (puan kaybı önlemi).
 * Mock tx, gerçek client ile aynı yüzeyi sunar; callback'e kendini geçirir.
 */
const mockPrisma = {
  badge: { findMany: (...a: unknown[]) => mockBadgeFindMany(...a) },
  userBadge: {
    findMany: (...a: unknown[]) => mockUserBadgeFindMany(...a),
    createMany: (...a: unknown[]) => mockCreateMany(...a),
  },
  notification: { create: (...a: unknown[]) => mockNotifCreate(...a) },
  user: {
    findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
    update: jest.fn().mockResolvedValue({}),
  },
  feedback: { count: (...a: unknown[]) => mockCount(...a) },
  referral: { count: (...a: unknown[]) => mockCount(...a) },
  userQuest: { count: (...a: unknown[]) => mockCount(...a) },
  analyticsEvent: { create: jest.fn().mockResolvedValue({}) },
  // $transaction: callback'i mock client ile çalıştırır (gerçek davranışı taklit eder).
  $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(mockPrisma)),
};

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// Ödül puanı kredisi: bu testin konusu rozet ATAMA mantığı; cüzdan işlemi ayrı test edilir.
jest.mock('@/lib/points-wallet', () => ({
  creditPointsAndXp: jest.fn().mockResolvedValue({ points: 0, xp: 0, leveledUp: false, newLevel: null }),
}));

import { awardEligibleSurpriseBadges, type UserBadgeCounters } from '@/lib/surprise-badges';

const counters: UserBadgeCounters = {
  feedbackCount: 30, totalPoints: 500, currentStreak: 5, longestStreak: 10,
  level: 8, referralCount: 2, questsCompleted: 4,
  // Gerçek-veri sayaçları (35 rozet canlandırma)
  fiveStarCount: 12, lowRatingCount: 3, positiveCount: 20, photoCount: 6,
  nightCount: 8, surpriseOpenedCount: 4, profileComplete: 1, accountAgeDays: 45,
  chatMessagesCount: 25, activeDays: 30, uniqueBusinesses: 11, revisitBusinesses: 4,
  leaderboardTop: 1, emojiCount: 15,
};

beforeEach(() => {
  mockBadgeFindMany.mockReset();
  mockUserBadgeFindMany.mockReset().mockResolvedValue([]);
  mockCreateMany.mockReset().mockResolvedValue({ count: 1 });
  mockNotifCreate.mockReset().mockResolvedValue({});
});

describe('awardEligibleSurpriseBadges', () => {
  it('koşulu sağlanan gizli rozeti verir + bildirim', async () => {
    mockBadgeFindMany.mockResolvedValue([
      { id: 'b1', name: 'Yorum Makinesi', requirement: { type: 'feedback_count', value: 25 } },
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded).toEqual(['b1']);
    expect(mockCreateMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(mockNotifCreate).toHaveBeenCalled();
  });

  it('koşulu SAĞLANMAYAN rozeti VERMEZ', async () => {
    mockBadgeFindMany.mockResolvedValue([
      { id: 'b2', name: 'Usta', requirement: { type: 'feedback_count', value: 50 } }, // 30 < 50
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded).toEqual([]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it('zaten sahip olunan rozeti atlar', async () => {
    mockUserBadgeFindMany.mockResolvedValue([{ badgeId: 'b1' }]);
    mockBadgeFindMany.mockResolvedValue([
      { id: 'b1', name: 'X', requirement: { type: 'feedback_count', value: 10 } },
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded).toEqual([]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it('custom requirement otomatik VERİLMEZ', async () => {
    mockBadgeFindMany.mockResolvedValue([
      { id: 'b3', name: 'İlham', requirement: { type: 'custom', value: 10 } },
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded).toEqual([]);
  });

  it('feedback varyant tipleri (detailed/long/helpful) yorum sayısına eşlenir', async () => {
    mockBadgeFindMany.mockResolvedValue([
      { id: 'b4', name: 'Filozof', requirement: { type: 'detailed_feedback_count', value: 10 } },
      { id: 'b5', name: 'Kelime', requirement: { type: 'long_feedback_count', value: 5 } },
      { id: 'b6', name: 'Keskin', requirement: { type: 'helpful_feedback', value: 20 } },
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters); // feedbackCount=30 ≥ hepsi
    expect(awarded.sort()).toEqual(['b4', 'b5', 'b6']);
  });

  it('yarış: createMany count=0 (başka istek verdi) → awarded\'a eklenmez', async () => {
    mockCreateMany.mockResolvedValue({ count: 0 });
    mockBadgeFindMany.mockResolvedValue([
      { id: 'b1', name: 'X', requirement: { type: 'feedback_count', value: 10 } },
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded).toEqual([]);
  });

  it('gerçek-veri sayaçları doğru eşlenir (5-yıldız/gece/foto/profil/işletme/hall-of-fame)', async () => {
    mockBadgeFindMany.mockResolvedValue([
      { id: 'm1', name: 'Mükemmeliyetçi', requirement: { type: 'five_star_count', value: 10 } }, // 12≥10 ✓
      { id: 'm2', name: 'Leyla', requirement: { type: 'night_feedback', value: 5 } },            // 8≥5 ✓
      { id: 'm3', name: 'Sessiz Sinema', requirement: { type: 'photo_feedback', value: 5 } },    // 6≥5 ✓
      { id: 'm4', name: 'Copy CV', requirement: { type: 'profile_complete', value: 1 } },        // 1≥1 ✓
      { id: 'm5', name: 'Tur Rehberi', requirement: { type: 'unique_businesses', value: 10 } },  // 11≥10 ✓
      { id: 'm6', name: 'Taht Sahibi', requirement: { type: 'leaderboard_top', value: 1 } },     // 1≥1 ✓
      { id: 'm7', name: 'Sürpriz Kutusu', requirement: { type: 'surprise_reward', value: 3 } },  // 4≥3 ✓
      { id: 'm8', name: 'Emoji Ustası', requirement: { type: 'emoji_feedback', value: 10 } },    // 15≥10 ✓
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded.sort()).toEqual(['m1','m2','m3','m4','m5','m6','m7','m8']);
  });

  it('gerçek sayaç eşiğin altındaysa VERİLMEZ (five_star 12 < 20)', async () => {
    mockBadgeFindMany.mockResolvedValue([
      { id: 'm1', name: 'Zor', requirement: { type: 'five_star_count', value: 20 } }, // 12 < 20
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded).toEqual([]);
  });

  it('total_points seed hatası kapatıldı (points ile aynı sayaca eşlenir)', async () => {
    mockBadgeFindMany.mockResolvedValue([
      { id: 'ef', name: 'Efsane', requirement: { type: 'total_points', value: 500 } }, // 500≥500 ✓
    ]);
    const awarded = await awardEligibleSurpriseBadges('u1', counters);
    expect(awarded).toEqual(['ef']);
  });
});
