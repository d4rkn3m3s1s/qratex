/**
 * İşletme kategorileri — KONTROLLÜ SÖZLÜK (Keşfet: Yakınımda filtresi + En iyiler sekmesi).
 *
 * Neden: `User.businessCategory` serbest metin ve gerçek bayilerin dolduracağı bir ürün yolu
 * yok (yalnız demo seed'i `demo-cafe` gibi değerler yazıyordu). Ham slug'ları çip olarak
 * göstermek yerine kategori şu sırayla TÜRETİLİR:
 *   1. `businessCategory` sözlükteki bir eşanlamlıya uyuyorsa (cafe → kahve) o.
 *   2. Bayinin aktif ürün kategorisi adlarından anahtar kelime eşleşmesi ("Sıcak Kahveler" → kahve).
 * `demo-*` değerleri ve tanınmayan metinler yok sayılır (müşteriye iç etiket sızmaz).
 * Saf modül; istemci de kullanır (etiket + ikon adı).
 */

export const PLACE_CATEGORY_SLUGS = ['kahve', 'restoran', 'tatli', 'kahvalti', 'bar', 'konaklama'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORY_SLUGS)[number];

export interface PlaceCategoryDef {
  slug: PlaceCategory;
  label: { tr: string; en: string };
  /** lucide ikon adı (istemci eşler). */
  icon: 'Coffee' | 'UtensilsCrossed' | 'CakeSlice' | 'Croissant' | 'Wine' | 'BedDouble';
  /** `businessCategory` için tam eşanlamlılar (normalize edilmiş). */
  synonyms: readonly string[];
  /** Ürün kategorisi adında aranan kökler (normalize edilmiş). */
  keywords: readonly string[];
}

export const PLACE_CATEGORIES: readonly PlaceCategoryDef[] = [
  {
    slug: 'kahve',
    label: { tr: 'Kahve', en: 'Coffee' },
    icon: 'Coffee',
    synonyms: ['cafe', 'kafe', 'kahve', 'coffee', 'coffee-shop', 'kahveci'],
    keywords: ['kahve', 'coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'filtre', 'mocha', 'frappe'],
  },
  {
    slug: 'restoran',
    label: { tr: 'Restoran', en: 'Restaurant' },
    icon: 'UtensilsCrossed',
    synonyms: ['restaurant', 'restoran', 'lokanta', 'yemek', 'food', 'fast-food', 'fastfood'],
    keywords: [
      'yemek', 'food', 'restoran', 'restaurant', 'kebap', 'kebab', 'pizza', 'burger', 'doner', 'izgara',
      'makarna', 'ana yemek', 'salata', 'corba', 'pide', 'lahmacun', 'balik', 'sushi', 'durum',
    ],
  },
  {
    slug: 'tatli',
    label: { tr: 'Tatlı & Pastane', en: 'Desserts & Bakery' },
    icon: 'CakeSlice',
    synonyms: ['dessert', 'tatli', 'pastane', 'bakery', 'firin', 'patisserie'],
    keywords: ['tatli', 'dessert', 'pasta', 'pastane', 'kek', 'cake', 'baklava', 'dondurma', 'ice cream', 'cheesecake', 'kurabiye', 'cikolata', 'firin', 'bakery'],
  },
  {
    slug: 'kahvalti',
    label: { tr: 'Kahvaltı', en: 'Breakfast' },
    icon: 'Croissant',
    synonyms: ['breakfast', 'kahvalti', 'brunch'],
    keywords: ['kahvalti', 'breakfast', 'brunch', 'serpme', 'omlet', 'menemen', 'simit', 'pogaca'],
  },
  {
    slug: 'bar',
    label: { tr: 'Bar & Pub', en: 'Bar & Pub' },
    icon: 'Wine',
    synonyms: ['bar', 'pub', 'meyhane', 'bistro'],
    keywords: ['kokteyl', 'cocktail', 'bira', 'beer', 'sarap', 'wine', 'meyhane', 'pub'],
  },
  {
    slug: 'konaklama',
    label: { tr: 'Konaklama', en: 'Stay' },
    icon: 'BedDouble',
    synonyms: ['hotel', 'otel', 'pansiyon', 'hostel', 'konaklama'],
    keywords: ['oda', 'konaklama', 'room service'],
  },
];

const BY_SLUG = new Map(PLACE_CATEGORIES.map((c) => [c.slug, c]));

export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === 'string' && BY_SLUG.has(value as PlaceCategory);
}

export function getPlaceCategory(slug: PlaceCategory): PlaceCategoryDef {
  return BY_SLUG.get(slug) as PlaceCategoryDef;
}

export function categoryLabel(slug: PlaceCategory, locale: 'tr' | 'en' = 'tr'): string {
  return BY_SLUG.get(slug)?.label[locale] ?? slug;
}

/** Türkçe karakterleri ASCII'ye indirip küçük harfe çevirir ("Sıcak Kahveler" → "sicak kahveler"). */
export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/[âà]/g, 'a')
    .replace(/[îì]/g, 'i')
    .replace(/[ûù]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `businessCategory` → sözlük slug'ı; demo/iç etiketler ve tanınmayanlar `null`. */
export function categoryFromBusinessCategory(raw: string | null | undefined): PlaceCategory | null {
  if (typeof raw !== 'string') return null;
  const text = normalizeText(raw).replace(/_/g, '-');
  if (!text || text.startsWith('demo')) return null;
  for (const def of PLACE_CATEGORIES) {
    if (def.synonyms.includes(text)) return def.slug;
  }
  return null;
}

/** Tek bir ürün kategorisi adının işaret ettiği slug'lar. */
export function categoriesFromProductName(name: string): PlaceCategory[] {
  const text = normalizeText(name);
  if (!text) return [];
  const out: PlaceCategory[] = [];
  for (const def of PLACE_CATEGORIES) {
    if (def.keywords.some((k) => text.includes(k))) out.push(def.slug);
  }
  return out;
}

/**
 * Bayinin kategorileri — birincil önce. Birincil: eşleşen `businessCategory`, yoksa ürün
 * adlarında en çok geçen kategori. Sıra kararlı (eşitlikte sözlük sırası).
 */
export function categorizeDealer(input: {
  businessCategory?: string | null;
  productCategoryNames?: readonly string[];
}): PlaceCategory[] {
  const counts = new Map<PlaceCategory, number>();
  for (const name of input.productCategoryNames ?? []) {
    for (const slug of categoriesFromProductName(name)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const fromProducts = PLACE_CATEGORY_SLUGS.filter((s) => counts.has(s)).sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || PLACE_CATEGORY_SLUGS.indexOf(a) - PLACE_CATEGORY_SLUGS.indexOf(b),
  );
  const primary = categoryFromBusinessCategory(input.businessCategory);
  if (!primary) return fromProducts;
  return [primary, ...fromProducts.filter((s) => s !== primary)];
}
