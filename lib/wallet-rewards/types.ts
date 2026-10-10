/**
 * Cüzdan → Ödüller / Ödüllerim yüzeyinin (m-cuzdan-oduller) sunucu ↔ istemci sözleşmesi.
 * Saf tipler: Prisma/DOM bağımlılığı yok, istemci bileşenleri de içe aktarır.
 *
 * Kural: istemciye yalnız buradaki alanlar gider (ham `metadata`, `_count`, iç kimlikler
 * ve açılmamış kutunun içeriği sızmaz).
 */

export type RewardKind = 'digital' | 'physical' | 'coupon' | 'other';

/** Kartın tek durum kaynağı — CTA, rozet ve detay penceresi bundan türer. */
export type RewardState = 'available' | 'insufficient' | 'soldOut' | 'upcoming' | 'expired' | 'limitReached';

export type StockInfo =
  | { kind: 'unlimited'; left: null }
  | { kind: 'ok'; left: number }
  | { kind: 'low'; left: number }
  | { kind: 'out'; left: 0 };

export interface RewardDTO {
  id: string;
  name: string;
  description: string;
  /** Emoji / kısa metin ikon (görsel yoksa). */
  glyph: string | null;
  /** Görsel yolu (yalnız `/` ya da `http(s)` ile başlayan). */
  imageUrl: string | null;
  cost: number;
  kind: RewardKind;
  state: RewardState;
  stock: StockInfo;
  validFrom: string | null;
  validUntil: string | null;
  perUserLimit: number | null;
  userClaimCount: number;
  /** Son 14 günde eklendi. */
  isNew: boolean;
  createdAt: string;
}

export interface RewardsCatalogDTO {
  balance: number;
  rewards: RewardDTO[];
  /** Puanı henüz yetmeyen, en ucuz alınabilir ödül (hedef halkası). */
  nextGoalId: string | null;
  /** Katalog 200 kayıtta kesildiyse. */
  truncated: boolean;
}

export type CosmeticType = 'avatar_frame' | 'profile_badge' | 'profile_background' | 'other';
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CosmeticDTO {
  id: string;
  name: string;
  description: string | null;
  type: CosmeticType;
  price: number;
  rarity: CosmeticRarity;
  rarityRank: number;
  /** Efekt anahtarı, görsel yolu ya da arka plan sınıfı (türe göre, mağaza ve panoda AYNI yorum). */
  asset: string | null;
  owned: boolean;
  equipped: boolean;
  pinned: boolean;
  /** Hediye olarak geldiyse gönderenin maskelenmiş adı. */
  giftedBy: string | null;
  giftMessage: string | null;
  createdAt: string;
}

export interface CosmeticsCatalogDTO {
  items: CosmeticDTO[];
  pinsUsed: number;
  pinLimit: number;
  preview: { image: string | null; name: string | null; frameColor: string | null };
}

/** `?pass=` derin linki: `reward:<id>` | `remedy:<id>` | `box:<id>`. */
export type PassKind = 'reward' | 'remedy' | 'box';

export interface RewardPassDTO {
  kind: 'reward';
  id: string;
  code: string | null;
  rewardName: string;
  rewardKind: RewardKind;
  glyph: string | null;
  imageUrl: string | null;
  description: string;
  issuedAt: string;
  usedAt: string | null;
}

export interface RemedyPassDTO {
  kind: 'remedy';
  id: string;
  /** Kasada okunan kısa başvuru numarası (teklif kimliğinden türetilir). */
  reference: string;
  businessName: string;
  /** "%20 İndirim", "1 adet Ücretsiz ürün". */
  label: string;
  selectionType: 'discount' | 'free_item';
  message: string;
  acceptedAt: string | null;
}

export type BoxSource = 'daily' | 'gift';

export interface BoxTeaserDTO {
  id: string;
  title: string;
  source: BoxSource;
  tier: CosmeticRarity;
  createdAt: string;
}

export interface OpenedBoxDTO {
  kind: 'box';
  id: string;
  title: string;
  message: string | null;
  source: BoxSource;
  tier: CosmeticRarity;
  points: number;
  couponCode: string | null;
  openedAt: string;
}

export interface DailyBoxDTO {
  dayKey: string;
  /** Bugünün kutusu oluşturulmuş mu (kullanıcı "Aç" dediğinde oluşur). */
  boxId: string | null;
  opened: boolean;
  /** Bir sonraki günlük kutunun açılacağı an (İstanbul gece yarısı). */
  nextAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OwnedWalletDTO {
  passes: RewardPassDTO[];
  remedyPasses: RemedyPassDTO[];
  usedPasses: Page<RewardPassDTO>;
  boxes: {
    enabled: boolean;
    daily: DailyBoxDTO | null;
    unopened: BoxTeaserDTO[];
    opened: Page<OpenedBoxDTO>;
  };
}

/** Kutu açılışının TEK içerik kaynağı (istemci modalı kutunun kendisinden değil bundan kurar). */
export interface RevealPayload {
  boxId: string;
  title: string;
  message: string | null;
  source: BoxSource;
  tier: CosmeticRarity;
  points: number;
  couponCode: string | null;
  /** Güncel bakiye (yalnız bu açılışta puan işlendiyse). */
  newBalance: number | null;
  /** Kutu daha önce açılmış: kutlama yapılmaz, yalnız içerik gösterilir. */
  alreadyOpened: boolean;
}

export interface ClaimRewardResult {
  userRewardId: string;
  code: string;
  rewardName: string;
  cost: number;
  newBalance: number;
}

export interface PurchaseCosmeticResult {
  cosmeticId: string;
  type: CosmeticType;
  newBalance: number;
}

export interface CosmeticStateResult {
  cosmeticId: string;
  equipped: boolean;
  pinned: boolean;
  pinsUsed: number;
  /** Oturumdaki (JWT) kuşanılmış çerçeve/arka plan için güncel değerler. */
  equippedFrame: string | null;
  equippedBackground: string | null;
}
