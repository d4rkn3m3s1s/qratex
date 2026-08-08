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

jest.mock('@/lib/prisma', () => ({
  prisma: {
    badge: { findMany: (...a: unknown[]) => mockBadgeFindMany(...a) },
    userBadge: {
      findMany: (...a: unknown[]) => mockUserBadgeFindMany(...a),
      createMany: (...a: unknown[]) => mockCreateMany(...a),
    },
    notification: { create: (...a: unknown[]) => mockNotifCreate(...a) },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    feedback: { count: (...a: unknown[]) => mockCount(...a) },
    referral: { count: (...a: unknown[]) => mockCount(...a) },
    userQuest: { count: (...a: unknown[]) => mockCount(...a) },
  },
}));

import { awardEligibleSurpriseBadges, type UserBadgeCounters } from '@/lib/surprise-badges';

const counters: UserBadgeCounters = {
  feedbackCount: 30, totalPoints: 500, currentStreak: 5, longestStreak: 10,
  level: 8, referralCount: 2, questsCompleted: 4,
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
});
