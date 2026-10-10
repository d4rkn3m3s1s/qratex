/**
 * Karakter barı yalnız YAYINDAKİ ve METİNLİ yorumları sayar (güvenlik incelemesi):
 * moderasyonla kaldırılan (deletedAt) sahte yorumlar ya da metni silinmiş yorumlar
 * kategori sayımına girip karakter rozeti (ve rozet ödül puanı) açtıramaz.
 */
const mockReviewGroupBy = jest.fn();
const mockReviewFindMany = jest.fn();
const mockUserBadgeFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    consumptionReview: {
      groupBy: (...a: unknown[]) => mockReviewGroupBy(...a),
      findMany: (...a: unknown[]) => mockReviewFindMany(...a),
    },
    userBadge: { findMany: (...a: unknown[]) => mockUserBadgeFindMany(...a) },
    settings: { findUnique: () => Promise.resolve(null) },
  },
  isPrismaConnectivityError: () => false,
}));

import { getCategoryProgress } from '@/lib/character-badges';

beforeEach(() => {
  jest.clearAllMocks();
  mockReviewGroupBy.mockResolvedValue([]);
  mockReviewFindMany.mockResolvedValue([]);
  mockUserBadgeFindMany.mockResolvedValue([]);
});

it('kategori sayımı kaldırılmış ve metinsiz yorumları dışlar', async () => {
  await getCategoryProgress('u1');
  expect(mockReviewGroupBy).toHaveBeenCalledTimes(1);
  expect(mockReviewGroupBy.mock.calls[0][0].where).toEqual({
    customerId: 'u1',
    characterCategory: { not: null },
    deletedAt: null,
    text: { not: null },
  });
  // Uzunluk şartlı kategori sayımı da aynı kapsamda.
  for (const [args] of mockReviewFindMany.mock.calls) {
    expect(args.where).toMatchObject({ customerId: 'u1', deletedAt: null, text: { not: null } });
  }
});
