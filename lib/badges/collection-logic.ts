/**
 * Müşteri rozet koleksiyonu — SAF yardımcılar ve DTO tipleri (Prisma/React yok; Jest ile test edilir).
 *
 * Yüzey: `/customer/me/badges` (m-rozetler). Veri yükleyici `lib/badges/customer-collection.ts`,
 * uç `GET /api/customer/badges`. İstemci tipleri buradan `import type` ile alır.
 *
 * TAM SÜRPRİZ politikası burada da geçerli: DTO YALNIZ kullanıcının kazandığı rozetleri taşır;
 * kazanılmamış rozetlerin adı/ikonu/sayısı asla yer almaz. "Keşfedilecek rozet var" sinyali
 * sayı sızdırmayan tek bir boolean'dır.
 */

export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'] as const;
export type CollectionRarity = (typeof RARITY_ORDER)[number];

/** Vitrine (profil) sabitlenebilecek toplam öge sınırı — `/api/customer/showcase` ile aynı kural. */
export const SHOWCASE_PIN_LIMIT = 4;

/** "Yeni" işareti: kazanımdan bu yana geçen süre (gün). Şemada `seenAt` yok; dürüst zaman tabanlı. */
export const NEW_BADGE_DAYS = 7;

export type CollectionKind = 'badge' | 'character';

export interface CharacterCategoryRef {
  key: string;
  name: string;
  emoji: string;
  /** Kategori kimlik rengi (hex, veri kaynaklı — `lib/character-categories`). */
  accent: string;
}

export interface CollectionItem {
  id: string;
  kind: CollectionKind;
  name: string;
  description: string;
  /** Özgün görsel yolu (detayda keskin SVG). */
  icon: string | null;
  /** Izgara küçük resmi (WebP, `resolveBadgeThumb`). */
  thumb: string | null;
  rarity: CollectionRarity;
  /** Normalleştirilmiş kategori anahtarı (rozet) ya da karakter kategorisi anahtarı. */
  category: string;
  /** Karakter rozetlerinde kategori kimliği. */
  characterCategory: CharacterCategoryRef | null;
  /** Admin rozet rengi (temizlenmiş hex) — nadirlik kenarını ezer. */
  color: string | null;
  earnedAt: string;
  /** Bu rozet için hesaba GERÇEKTEN yatan puan (points_credited kayıtlarından). */
  creditedPoints: number;
  /** Bu rozetin ödül tablosundaki değeri (bilgi amaçlı; satın alınan/admin hediyesinde 0 yatmış olabilir). */
  catalogPoints: number;
  /** Rozete sahip kullanıcı sayısı (≥ 1 — kullanıcının kendisi dahil). */
  holders: number;
  /** "Kullanıcıların %X'inde" (müşteri tabanına oran); bilinmiyorsa null. */
  holdersPct: number | null;
  /** Kazanım kutlama metni (`emoji-badge-texts` / `character-reveal-texts` → quote). */
  quote: string | null;
  isPinned: boolean;
  isNew: boolean;
  /** Admin'in "kazanılana kadar gizli" işaretlediği sürpriz rozet. */
  surprise: boolean;
}

export interface CharacterCategoryStat extends CharacterCategoryRef {
  collected: number;
  /** Kategorideki tüm karakterler toplandı mı (toplam sayı sızdırılmaz; yalnız tamamlandı bilgisi). */
  complete: boolean;
}

export interface CharacterBar {
  current: number;
  threshold: number;
  progress: number;
  remaining: number;
  ready: boolean;
}

export interface NextSurprise {
  current: number;
  target: number;
  remaining: number;
}

export interface CollectionStats {
  /** Toplanan rozet (normal + karakter). Payda YOK — sürpriz politikası. */
  total: number;
  badges: number;
  characters: number;
  /** Rozetlerden gelen toplam puan (gerçek kredi kayıtları). */
  pointsFromBadges: number;
  /** Bu ay (Europe/Istanbul) kazanılan. */
  earnedThisMonth: number;
  legendary: number;
  epic: number;
  /** En nadir rozet (en az sahipli). */
  rarest: { id: string; name: string; rarity: CollectionRarity; holdersPct: number | null } | null;
  /** Bu sayfadan sabitlenen rozet sayısı. */
  pinnedBadges: number;
  /** Vitrin toplam doluluğu (rozet + kozmetik) — sınır `SHOWCASE_PIN_LIMIT`. */
  pinnedTotal: number;
  pinLimit: number;
}

export interface CollectionOverview {
  items: CollectionItem[];
  stats: CollectionStats;
  character: {
    featuredBadgeId: string | null;
    bar: CharacterBar | null;
    categoryStats: CharacterCategoryStat[];
  };
  /** Kazanılmamış en az bir aktif (karakter dışı) rozet var mı — sayı sızdırmaz. */
  moreToDiscover: boolean;
  /** Bir sonraki yorum-kilometre-taşı sürprizine yakınlık (rozet adı yok). */
  nextSurprise: NextSurprise | null;
  generatedAt: string;
}

// ───────────────────────────── Nadirlik ─────────────────────────────

export function normalizeCollectionRarity(value: unknown): CollectionRarity {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (RARITY_ORDER as readonly string[]).includes(v) ? (v as CollectionRarity) : 'common';
}

/** 0 = yaygın … 3 = efsanevi. Metin sıralaması (`rare > legendary > epic`) hatasını kapatır. */
export function rarityRank(r: CollectionRarity): number {
  return RARITY_ORDER.indexOf(r);
}

// ───────────────────────────── Kategori ─────────────────────────────

const CATEGORY_ALIASES: Record<string, string> = {
  dizi: 'dizi',
  series: 'dizi',
  diger: 'diger',
  other: 'diger',
  etkinlik: 'etkinlik',
  event: 'etkinlik',
  sadakat: 'sadakat',
  loyalty: 'sadakat',
  feedback: 'feedback',
  engagement: 'engagement',
  streak: 'streak',
  speed: 'speed',
  exploration: 'exploration',
  expertise: 'expertise',
  rating: 'rating',
  special: 'special',
  custom: 'custom',
  general: 'general',
};

export const BADGE_CATEGORY_KEYS = [
  'feedback',
  'engagement',
  'speed',
  'exploration',
  'streak',
  'rating',
  'expertise',
  'special',
  'general',
  'dizi',
  'etkinlik',
  'sadakat',
  'diger',
  'custom',
] as const;

export function normalizeBadgeCategory(category: unknown): string {
  if (typeof category !== 'string' || !category.trim()) return 'general';
  return CATEGORY_ALIASES[category.trim().toLowerCase()] ?? 'general';
}

// ───────────────────────────── Oranlar ve zaman ─────────────────────────────

/** Sahiplik oranı (%) — bir ondalık. Taban yoksa null. */
export function holdersPercent(holders: number, totalCustomers: number): number | null {
  if (!Number.isFinite(totalCustomers) || totalCustomers <= 0) return null;
  const h = Math.max(1, Math.floor(Number(holders) || 0));
  return Math.min(100, Math.round((h / totalCustomers) * 1000) / 10);
}

export function isNewlyEarned(earnedAt: Date, now: Date, days: number = NEW_BADGE_DAYS): boolean {
  const diff = now.getTime() - earnedAt.getTime();
  return diff >= 0 && diff < days * 86_400_000;
}

const ISTANBUL_TZ = 'Europe/Istanbul';
let monthFmt: Intl.DateTimeFormat | null = null;

/** Verilen anın İstanbul takvimindeki `YYYY-MM` değeri. */
export function istanbulMonthKey(at: Date): string {
  if (!monthFmt) {
    monthFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL_TZ, year: 'numeric', month: '2-digit' });
  }
  const parts = monthFmt.formatToParts(at);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${y}-${m}`;
}

// ───────────────────────────── Puan kredileri ─────────────────────────────

/**
 * `points_credited` (category `badge`) olaylarından rozet başına yatan puan. Eski yol
 * (`data.badgeId`) ve `mintPoints` yolu (`data.badgeId` meta + `data.sourceId`) birlikte okunur.
 */
export function creditedPointsByBadge(events: ReadonlyArray<{ data: unknown }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (!e || typeof e.data !== 'object' || e.data === null || Array.isArray(e.data)) continue;
    const d = e.data as Record<string, unknown>;
    const badgeId =
      typeof d.badgeId === 'string' && d.badgeId
        ? d.badgeId
        : d.source === 'badge' && typeof d.sourceId === 'string' && d.sourceId
          ? d.sourceId
          : null;
    const points = typeof d.points === 'number' && Number.isFinite(d.points) ? Math.max(0, Math.floor(d.points)) : 0;
    if (!badgeId || points <= 0) continue;
    out.set(badgeId, (out.get(badgeId) ?? 0) + points);
  }
  return out;
}

// ───────────────────────────── İstatistikler ─────────────────────────────

export function buildStats(
  items: readonly CollectionItem[],
  opts: { now: Date; pinnedCosmetics: number },
): CollectionStats {
  const monthKey = istanbulMonthKey(opts.now);
  let pointsFromBadges = 0;
  let earnedThisMonth = 0;
  let legendary = 0;
  let epic = 0;
  let badges = 0;
  let characters = 0;
  let pinnedBadges = 0;
  let rarest: CollectionItem | null = null;

  for (const it of items) {
    pointsFromBadges += it.creditedPoints;
    if (istanbulMonthKey(new Date(it.earnedAt)) === monthKey) earnedThisMonth++;
    if (it.rarity === 'legendary') legendary++;
    if (it.rarity === 'epic') epic++;
    if (it.kind === 'character') characters++;
    else badges++;
    if (it.isPinned) pinnedBadges++;
    if (
      !rarest ||
      it.holders < rarest.holders ||
      (it.holders === rarest.holders && rarityRank(it.rarity) > rarityRank(rarest.rarity))
    ) {
      rarest = it;
    }
  }

  return {
    total: items.length,
    badges,
    characters,
    pointsFromBadges,
    earnedThisMonth,
    legendary,
    epic,
    rarest: rarest ? { id: rarest.id, name: rarest.name, rarity: rarest.rarity, holdersPct: rarest.holdersPct } : null,
    pinnedBadges,
    pinnedTotal: pinnedBadges + Math.max(0, Math.floor(opts.pinnedCosmetics || 0)),
    pinLimit: SHOWCASE_PIN_LIMIT,
  };
}

// ───────────────────────────── Sıralama ─────────────────────────────

export type CollectionSort = 'recent' | 'rarity' | 'category';

export function sortCollection(items: readonly CollectionItem[], sort: CollectionSort): CollectionItem[] {
  const byRecent = (a: CollectionItem, b: CollectionItem) =>
    new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime() || a.name.localeCompare(b.name, 'tr');
  const list = [...items];
  if (sort === 'rarity') {
    return list.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.holders - b.holders || byRecent(a, b));
  }
  if (sort === 'category') {
    const order = (c: string) => {
      const i = (BADGE_CATEGORY_KEYS as readonly string[]).indexOf(c);
      return i < 0 ? 999 : i;
    };
    return list.sort((a, b) => order(a.category) - order(b.category) || rarityRank(b.rarity) - rarityRank(a.rarity) || byRecent(a, b));
  }
  return list.sort(byRecent);
}

/** Arama: ad + açıklama, Türkçe büyük/küçük harf duyarsız. */
export function matchesQuery(item: Pick<CollectionItem, 'name' | 'description'>, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  if (!needle) return true;
  return (
    item.name.toLocaleLowerCase('tr-TR').includes(needle) || item.description.toLocaleLowerCase('tr-TR').includes(needle)
  );
}

// ───────────────────────────── Sonraki sürpriz ─────────────────────────────

/**
 * Yorum-sayısı kilometre taşları arasından kullanıcının henüz sahip olmadığı EN YAKIN
 * (aktif) rozete yakınlık. Rozet adı dönmez; yalnız sayaç. Uygun aday yoksa null.
 */
export function computeNextSurprise(
  totalReviews: number,
  milestones: ReadonlyArray<{ badgeId: string; at: number }>,
  owned: ReadonlySet<string>,
  active: ReadonlySet<string>,
): NextSurprise | null {
  const total = Math.max(0, Math.floor(Number(totalReviews) || 0));
  const next = [...milestones]
    .filter((m) => m.at > total && !owned.has(m.badgeId) && active.has(m.badgeId))
    .sort((a, b) => a.at - b.at)[0];
  if (!next) return null;
  return { current: total, target: next.at, remaining: next.at - total };
}

// ───────────────────────────── Topluluk ─────────────────────────────

/** "Furkan Uluç" → "Furkan U." · tek ad → aynen · boş → null. Soyad sızmaz. */
export function maskDisplayName(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0].length > 24 ? `${parts[0].slice(0, 24)}…` : parts[0];
  if (parts.length === 1) return first;
  const initial = parts[parts.length - 1].charAt(0).toLocaleUpperCase('tr-TR');
  return `${first} ${initial}.`;
}

/** Yarışma sırası (1224): kendisinden KESİN fazla sayıya sahip kişi sayısı + 1. 0 sayıda sıra yok. */
export function competitionRank(myCount: number, allCounts: readonly number[]): number | null {
  if (!(myCount > 0)) return null;
  let ahead = 0;
  for (const c of allCounts) if (c > myCount) ahead++;
  return ahead + 1;
}
