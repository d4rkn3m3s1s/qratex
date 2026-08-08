/**
 * getCategoryProgress — karakter "gizli bar" eşik hesabı. Reveal ekonomisinin kalbi:
 * bir kategoride (toplam kategorize yorum) - (o kategoride alınan rozet × 6) >= 6 ise
 * "ready". Alınan her rozet 6 eşiği "tüketir" — böylece aynı kategoride ikinci karakter
 * için bar sıfırdan dolar. Bu testler o hesabı ve "ready" koşulunu korur (reveal yarış
 * fix'i de bu değişmeze dayanır).
 */
const mockReviewGroupBy = jest.fn();
const mockUserBadgeFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    consumptionReview: { groupBy: (...a: unknown[]) => mockReviewGroupBy(...a) },
    userBadge: { findMany: (...a: unknown[]) => mockUserBadgeFindMany(...a) },
    // Admin eşik override okuması (character-thresholds) — override yok → kod-default kullanılır.
    settings: { findUnique: () => Promise.resolve(null) },
  },
  isPrismaConnectivityError: () => false,
}));

import { getCategoryProgress, CATEGORY_BADGE_THRESHOLD } from '@/lib/character-badges';
import { CHARACTER_CATEGORIES } from '@/lib/character-categories';

const CAT = CHARACTER_CATEGORIES[0]; // ilk kategori (örn. dram-suc)
const THRESHOLD = CATEGORY_BADGE_THRESHOLD;

/** groupBy dönüşü: kategori → yorum sayısı. */
function reviews(map: Record<string, number>) {
  return Object.entries(map).map(([characterCategory, n]) => ({
    characterCategory,
    _count: { _all: n },
  }));
}
/** userBadge.findMany dönüşü: sahip olunan badgeId listesi. */
function owned(...badgeIds: string[]) {
  return badgeIds.map((badgeId) => ({ badgeId }));
}

beforeEach(() => {
  mockReviewGroupBy.mockReset();
  mockUserBadgeFindMany.mockReset();
});

describe('getCategoryProgress — eşik hesabı', () => {
  it('hiç yorum yoksa bar boş, ready değil', async () => {
    mockReviewGroupBy.mockResolvedValue([]);
    mockUserBadgeFindMany.mockResolvedValue([]);
    const prog = await getCategoryProgress('u1');
    expect(prog.current).toBe(0);
    expect(prog.ready).toBe(false);
    expect(prog.threshold).toBe(THRESHOLD);
  });

  it('eşiğin altındaki yorum sayısı: current=n, ready değil', async () => {
    mockReviewGroupBy.mockResolvedValue(reviews({ [CAT.key]: THRESHOLD - 1 }));
    mockUserBadgeFindMany.mockResolvedValue([]);
    const prog = await getCategoryProgress('u1');
    expect(prog.topCategoryKey).toBe(CAT.key);
    expect(prog.current).toBe(THRESHOLD - 1);
    expect(prog.ready).toBe(false);
  });

  it('tam eşik yorum + hiç rozet yok: ready=true, current=threshold', async () => {
    mockReviewGroupBy.mockResolvedValue(reviews({ [CAT.key]: THRESHOLD }));
    mockUserBadgeFindMany.mockResolvedValue([]);
    const prog = await getCategoryProgress('u1');
    expect(prog.topCategoryKey).toBe(CAT.key);
    expect(prog.ready).toBe(true);
    expect(prog.current).toBe(THRESHOLD);
  });

  it('eşik dolu AMA o kategoride 1 rozet alınmış: eşik tüketilmiş, ready=false', async () => {
    // total = THRESHOLD, taken = 1 → consumed = THRESHOLD → current = 0, ready=false
    mockReviewGroupBy.mockResolvedValue(reviews({ [CAT.key]: THRESHOLD }));
    mockUserBadgeFindMany.mockResolvedValue(owned(CAT.characterIds[0]));
    const prog = await getCategoryProgress('u1');
    expect(prog.ready).toBe(false);
    expect(prog.current).toBe(0);
  });

  it('ikinci karakter için: 1 rozet alınmış + 2×eşik yorum → tekrar ready', async () => {
    // total = 2*THRESHOLD, taken = 1 → consumed = THRESHOLD → kalan THRESHOLD → ready=true
    mockReviewGroupBy.mockResolvedValue(reviews({ [CAT.key]: THRESHOLD * 2 }));
    mockUserBadgeFindMany.mockResolvedValue(owned(CAT.characterIds[0]));
    const prog = await getCategoryProgress('u1');
    expect(prog.topCategoryKey).toBe(CAT.key);
    expect(prog.ready).toBe(true);
    expect(prog.current).toBe(THRESHOLD);
  });

  it('kategorideki TÜM karakterler alınmışsa o kategori aday olmaz', async () => {
    // Kategorinin tüm karakterleri alınmış → availableChars boş → bu kategori atlanır.
    mockReviewGroupBy.mockResolvedValue(reviews({ [CAT.key]: THRESHOLD * 10 }));
    mockUserBadgeFindMany.mockResolvedValue(owned(...CAT.characterIds));
    const prog = await getCategoryProgress('u1');
    // Bu kategori seçilemez; başka kategori de yorumsuz → topCategoryKey CAT.key OLMAMALI.
    expect(prog.topCategoryKey).not.toBe(CAT.key);
    expect(prog.ready).toBe(false);
  });

  it('hazır kategori, ilerlemesi yüksek ama hazır-olmayana tercih edilir', async () => {
    const catA = CHARACTER_CATEGORIES[0];
    const catB = CHARACTER_CATEGORIES[1];
    // A: eşiğe 1 kala (yüksek ilerleme, ready değil). B: tam eşik (ready).
    mockReviewGroupBy.mockResolvedValue(
      reviews({ [catA.key]: THRESHOLD - 1, [catB.key]: THRESHOLD })
    );
    mockUserBadgeFindMany.mockResolvedValue([]);
    const prog = await getCategoryProgress('u1');
    expect(prog.topCategoryKey).toBe(catB.key); // ready olan öncelikli
    expect(prog.ready).toBe(true);
  });
});
