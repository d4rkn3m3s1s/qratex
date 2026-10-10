/**
 * Keşfet → En iyiler: Bayes sıralaması (denetim customer_category-leaderboard B3) ve kontrollü
 * kategori sözlüğü (B1/B10: demo/ham slug müşteriye sızmaz). Konum yardımcıları ve eski rota
 * yönlendirmeleri de burada.
 */
import { bayesScore, displayRating, priorMean, rankDealers } from '@/lib/places/ranking';
import { categorizeDealer, categoryFromBusinessCategory, categoryLabel, normalizeText } from '@/lib/places/categories';
import { boundingBox, clampRadiusKm, coarsen, distanceKm, formatDistance, walkingMinutes } from '@/lib/places/geo';
import { legacyPlacesHref } from '@/lib/places/legacy-redirect';
import { claimBodySchema, nearbyQuerySchema, topQuerySchema } from '@/lib/places/query-schemas';

describe('rankDealers (Bayes)', () => {
  it('3 yorumla 5,00 alan, 300 yorumla 4,93 ve 40 yorumla 4,5 alanın ÖNÜNE geçemez', () => {
    const ranked = rankDealers([
      { dealerId: 'small', n: 3, avg: 5 },
      { dealerId: 'big', n: 300, avg: 4.93 },
      { dealerId: 'mid', n: 40, avg: 4.5 },
    ]);
    expect(ranked.map((r) => r.dealerId)).toEqual(['big', 'mid', 'small']);
  });

  it('eşik altındakiler elenir; eşit skorda aynı sıra (yoğun), kararlı kırılım', () => {
    const ranked = rankDealers([
      { dealerId: 'b', n: 10, avg: 4 },
      { dealerId: 'a', n: 10, avg: 4 },
      { dealerId: 'x', n: 2, avg: 5 },
    ]);
    expect(ranked.map((r) => [r.dealerId, r.rank])).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });

  it('önsel ortalama ve kart puanı', () => {
    expect(priorMean([])).toBe(4);
    expect(priorMean([{ dealerId: 'a', n: 2, avg: 5 }, { dealerId: 'b', n: 2, avg: 3 }])).toBe(4);
    expect(bayesScore(5, 0, 4)).toBe(4);
    expect(displayRating({ n: 2, avg: 5 })).toBeNull();
    expect(displayRating({ n: 12, avg: 4.444 })).toEqual({ avg: 4.4, n: 12 });
  });
});

describe('kategori sözlüğü', () => {
  it('demo ve tanınmayan değerler sızmaz; eşanlamlılar eşlenir', () => {
    expect(categoryFromBusinessCategory('demo-cafe')).toBeNull();
    expect(categoryFromBusinessCategory('Cafe')).toBe('kahve');
    expect(categoryFromBusinessCategory('restaurant')).toBe('restoran');
    expect(categoryFromBusinessCategory('uzay istasyonu')).toBeNull();
  });

  it('ürün kategorilerinden türetir; birincil önce', () => {
    expect(categorizeDealer({ businessCategory: null, productCategoryNames: ['Sıcak Kahveler', 'Tatlılar', 'Soğuk Kahveler'] })).toEqual(['kahve', 'tatli']);
    expect(categorizeDealer({ businessCategory: 'bakery', productCategoryNames: ['Filtre Kahve'] })).toEqual(['tatli', 'kahve']);
    expect(categorizeDealer({ businessCategory: 'demo-hotel', productCategoryNames: [] })).toEqual([]);
  });

  it('Türkçe metin normalleştirme ve etiket', () => {
    expect(normalizeText('  Çiğ  KÖFTE ŞİŞ ')).toBe('cig kofte sis');
    expect(categoryLabel('tatli', 'tr')).toBe('Tatlı & Pastane');
    expect(categoryLabel('kahve', 'en')).toBe('Coffee');
  });
});

describe('konum yardımcıları', () => {
  it('konum ~110 m hassasiyete yuvarlanır; yarıçap 0,5–50 km', () => {
    expect(coarsen(41.0123456)).toBe(41.012);
    expect(clampRadiusKm(1000)).toBe(50);
    expect(clampRadiusKm(0)).toBe(0.5);
    expect(clampRadiusKm('x')).toBe(5);
  });

  it('mesafe, kutu ve tek biçim', () => {
    const d = distanceKm(41, 29, 41.01, 29);
    expect(d).toBeGreaterThan(1.0);
    expect(d).toBeLessThan(1.2);
    const box = boundingBox(41, 29, 5);
    expect(box.minLat).toBeLessThan(41);
    expect(box.maxLng).toBeGreaterThan(29);
    expect(formatDistance(0.347)).toBe('350 m');
    expect(formatDistance(1.25)).toBe('1,3 km');
    expect(walkingMinutes(0.8)).toBe(10);
  });
});

describe('eski rotalar → Keşfet sekmesi', () => {
  it('sekme eşlemesi ve sorgu korunur', () => {
    expect(legacyPlacesHref('nearby', {})).toBe('/customer/places');
    expect(legacyPlacesHref('favorites', {})).toBe('/customer/places?tab=saved');
    expect(legacyPlacesHref('campaigns', { proposal: 'p1' })).toBe('/customer/places?tab=deals&proposal=p1');
    expect(legacyPlacesHref('event', {})).toBe('/customer/places?tab=deals');
    expect(legacyPlacesHref('category-leaderboard', { category: 'kahve' })).toBe('/customer/places?tab=top&category=kahve');
  });

  it('ölü ?focus= / ?dealerId= linkleri mekân detayına gider; geçersiz kimlik yok sayılır', () => {
    expect(legacyPlacesHref('nearby', { focus: 'dealer_1' })).toBe('/customer/places/dealer_1');
    expect(legacyPlacesHref('favorites', { dealerId: 'abc' })).toBe('/customer/places/abc');
    expect(legacyPlacesHref('nearby', { focus: '../x' })).toBe('/customer/places');
  });
});

describe('BFF sorgu şemaları', () => {
  it('boş parametre yok sayılır; konum yuvarlanır; yarıçap kırpılır', () => {
    const r = nearbyQuerySchema.parse({ lat: '41.0123456', lng: '29.0098765', radius: '999', open: '1', category: '' });
    expect(r).toMatchObject({ lat: 41.012, lng: 29.01, radius: 50, open: true, boost: false, category: undefined });
  });

  it('enlem/boylam birlikte olmalı; bilinmeyen kategori reddedilir', () => {
    expect(nearbyQuerySchema.safeParse({ lat: '41' }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ category: 'demo-cafe' }).success).toBe(false);
    expect(topQuerySchema.parse({ window: '30' }).window).toBe(30);
    expect(topQuerySchema.parse({}).window).toBe(90);
  });

  it('talep gövdesi: opsiyonel kampanya kimliği, fazladan alan yok', () => {
    expect(claimBodySchema.safeParse(undefined).success).toBe(true);
    expect(claimBodySchema.safeParse({ campaignId: 'c1' }).success).toBe(true);
    expect(claimBodySchema.safeParse({ campaignId: 'c1', points: 999 }).success).toBe(false);
  });
});
