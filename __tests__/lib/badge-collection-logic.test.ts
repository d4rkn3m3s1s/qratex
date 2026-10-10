/**
 * Rozet koleksiyonu saf yardımcıları (lib/badges/collection-logic.ts) — yüzey /customer/me/badges.
 */
import {
  buildStats,
  competitionRank,
  computeNextSurprise,
  creditedPointsByBadge,
  holdersPercent,
  isNewlyEarned,
  istanbulMonthKey,
  maskDisplayName,
  matchesQuery,
  normalizeBadgeCategory,
  normalizeCollectionRarity,
  rarityRank,
  sortCollection,
  SHOWCASE_PIN_LIMIT,
  type CollectionItem,
} from '@/lib/badges/collection-logic';

function item(over: Partial<CollectionItem> & { id: string }): CollectionItem {
  return {
    kind: 'badge',
    name: over.id,
    description: '',
    icon: null,
    thumb: null,
    rarity: 'common',
    category: 'general',
    characterCategory: null,
    color: null,
    earnedAt: '2026-10-01T10:00:00.000Z',
    creditedPoints: 0,
    catalogPoints: 0,
    holders: 10,
    holdersPct: 10,
    quote: null,
    isPinned: false,
    isNew: false,
    surprise: false,
    ...over,
  };
}

describe('nadirlik', () => {
  it('bilinmeyen/boş değer yaygına iner; sıra metinle değil kademeyle', () => {
    expect(normalizeCollectionRarity('LEGENDARY')).toBe('legendary');
    expect(normalizeCollectionRarity('mythic')).toBe('common');
    expect(normalizeCollectionRarity(null)).toBe('common');
    // Eski sunucu sıralaması alfabetikti: rare > legendary > epic > common.
    const sorted = sortCollection(
      [item({ id: 'r', rarity: 'rare' }), item({ id: 'l', rarity: 'legendary' }), item({ id: 'e', rarity: 'epic' }), item({ id: 'c' })],
      'rarity',
    ).map((i) => i.id);
    expect(sorted).toEqual(['l', 'e', 'r', 'c']);
    expect(rarityRank('legendary')).toBeGreaterThan(rarityRank('epic'));
  });
});

describe('sıralama ve arama', () => {
  it('varsayılan: en yeni kazanılan önce', () => {
    const out = sortCollection(
      [item({ id: 'eski', earnedAt: '2026-01-01T00:00:00Z' }), item({ id: 'yeni', earnedAt: '2026-10-09T00:00:00Z' })],
      'recent',
    );
    expect(out[0].id).toBe('yeni');
  });

  it('kategori sıralaması sabit kategori düzenini izler', () => {
    const out = sortCollection([item({ id: 'g', category: 'general' }), item({ id: 'f', category: 'feedback' })], 'category');
    expect(out.map((i) => i.id)).toEqual(['f', 'g']);
  });

  it('arama Türkçe büyük/küçük harf duyarsız (İ/ı)', () => {
    expect(matchesQuery({ name: 'İLHAM KAYNAĞI', description: '' }, 'ilham')).toBe(true);
    expect(matchesQuery({ name: 'Yankı', description: 'Yorumların beğenildi' }, 'BEĞENİ')).toBe(true);
    expect(matchesQuery({ name: 'Flash', description: '' }, 'jet')).toBe(false);
    expect(matchesQuery({ name: 'Flash', description: '' }, '  ')).toBe(true);
  });

  it('kategori takma adları normalleşir', () => {
    expect(normalizeBadgeCategory('Series')).toBe('dizi');
    expect(normalizeBadgeCategory('loyalty')).toBe('sadakat');
    expect(normalizeBadgeCategory('???')).toBe('general');
    expect(normalizeBadgeCategory(undefined)).toBe('general');
  });
});

describe('oranlar ve zaman', () => {
  it('sahiplik yüzdesi bir ondalık, taban yoksa null, en az 1 sahip', () => {
    expect(holdersPercent(1, 1000)).toBe(0.1);
    expect(holdersPercent(0, 1000)).toBe(0.1);
    expect(holdersPercent(250, 1000)).toBe(25);
    expect(holdersPercent(5, 0)).toBeNull();
  });

  it('"yeni" yalnız son 7 gün; gelecek tarih yeni sayılmaz', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(isNewlyEarned(new Date('2026-10-05T12:00:00Z'), now)).toBe(true);
    expect(isNewlyEarned(new Date('2026-10-02T12:00:00Z'), now)).toBe(false);
    expect(isNewlyEarned(new Date('2026-10-11T12:00:00Z'), now)).toBe(false);
  });

  it('ay anahtarı İstanbul saatine göre (UTC 21:30 → ertesi ay)', () => {
    expect(istanbulMonthKey(new Date('2026-09-30T21:30:00Z'))).toBe('2026-10');
    expect(istanbulMonthKey(new Date('2026-09-30T20:30:00Z'))).toBe('2026-09');
  });
});

describe('gerçek kredi', () => {
  it('eski (data.badgeId) ve mintPoints (source/sourceId) olaylarını birlikte okur; bozuk satırları atlar', () => {
    const map = creditedPointsByBadge([
      { data: { points: 200, badgeId: 'badge-yeni-ses' } },
      { data: { points: 4000, source: 'badge', sourceId: 'badge-yorum-makinesi', badgeId: 'badge-yorum-makinesi' } },
      { data: { points: 500, source: 'badge', sourceId: 'badge-filiz' } },
      { data: { points: 0, badgeId: 'badge-x' } },
      { data: null },
      { data: ['x'] },
      { data: { points: 100, source: 'game', sourceId: 's1' } },
    ]);
    expect(Object.fromEntries(map)).toEqual({ 'badge-yeni-ses': 200, 'badge-yorum-makinesi': 4000, 'badge-filiz': 500 });
  });
});

describe('istatistikler', () => {
  it('paydasız toplam, gerçek puan toplamı, bu ay (İstanbul), en nadir, vitrin doluluğu', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const stats = buildStats(
      [
        item({ id: 'a', creditedPoints: 200, earnedAt: '2026-10-02T00:00:00Z', holders: 50, rarity: 'common', isPinned: true }),
        item({ id: 'b', creditedPoints: 4000, earnedAt: '2026-09-30T22:00:00Z', holders: 3, rarity: 'legendary' }),
        item({ id: 'c', kind: 'character', earnedAt: '2026-08-01T00:00:00Z', holders: 3, rarity: 'rare' }),
        item({ id: 'd', rarity: 'epic', earnedAt: '2026-09-15T00:00:00Z' }),
      ],
      { now, pinnedCosmetics: 2 },
    );
    expect(stats).toMatchObject({
      total: 4,
      badges: 3,
      characters: 1,
      pointsFromBadges: 4200,
      earnedThisMonth: 2,
      legendary: 1,
      epic: 1,
      pinnedBadges: 1,
      pinnedTotal: 3,
      pinLimit: SHOWCASE_PIN_LIMIT,
    });
    // Eşit sahiplikte daha yüksek kademe "en nadir" sayılır.
    expect(stats.rarest?.id).toBe('b');
  });

  it('boş koleksiyonda en nadir yok, toplam 0', () => {
    const stats = buildStats([], { now: new Date(), pinnedCosmetics: 0 });
    expect(stats.total).toBe(0);
    expect(stats.rarest).toBeNull();
  });
});

describe('sonraki sürpriz', () => {
  const milestones = [
    { badgeId: 'm1', at: 1 },
    { badgeId: 'm20', at: 20 },
    { badgeId: 'm50', at: 50 },
  ];
  it('sahip olunmayan ve AKTİF en yakın eşik', () => {
    expect(computeNextSurprise(7, milestones, new Set(['m1']), new Set(['m1', 'm20', 'm50']))).toEqual({
      current: 7,
      target: 20,
      remaining: 13,
    });
  });
  it('pasif rozet sinyal üretmez (sahte ilerleme yok)', () => {
    expect(computeNextSurprise(7, milestones, new Set(['m1']), new Set(['m1', 'm50']))).toEqual({
      current: 7,
      target: 50,
      remaining: 43,
    });
  });
  it('eşiği geçmiş ama rozeti verilmemişse o eşik atlanır; aday yoksa null', () => {
    expect(computeNextSurprise(60, milestones, new Set(), new Set(['m1', 'm20', 'm50']))).toBeNull();
  });
});

describe('topluluk', () => {
  it('ad maskeleme: soyad sızmaz', () => {
    expect(maskDisplayName('Furkan Uluç')).toBe('Furkan U.');
    expect(maskDisplayName('ayşe nur ışık')).toBe('ayşe I.');
    expect(maskDisplayName('Didar')).toBe('Didar');
    expect(maskDisplayName('   ')).toBeNull();
    expect(maskDisplayName(null)).toBeNull();
  });
  it('yarışma sırası: eşitler aynı sırayı alır; 0 sayıda sıra yok', () => {
    expect(competitionRank(5, [9, 5, 5, 2])).toBe(2);
    expect(competitionRank(2, [9, 5, 5, 2])).toBe(4);
    expect(competitionRank(0, [1])).toBeNull();
  });
});
