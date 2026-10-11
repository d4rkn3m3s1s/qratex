/**
 * Admin → Mağaza ve Ödüller (/admin/rewards) sözleşmesi — istemci + sunucu ortak.
 *
 * Üç sekme: Ödüller (Reward), Kozmetik (CosmeticItem), Talepler (UserReward teslim zinciri).
 * Şemalar tek doğruluk kaynağıdır: form `useZodForm(...)` ile, BFF `defineRoute({ schema })`
 * ile AYNI şemayı kullanır (rapor admin_rewards B1/B5/B8, admin_shop Bulgu 7).
 */
import { z } from 'zod';

// ───────────────────────── Ortak ─────────────────────────

export const STORE_PAGE_SIZE = 25;
const pageFields = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(5).max(100).default(STORE_PAGE_SIZE),
};

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface AuditRow {
  id: string;
  action: string;
  label: string;
  at: string;
  actor: string | null;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
}

export interface DayPoint {
  day: string;
  count: number;
}

/** Görsel kaynağı mı (kök-göreli yol ya da http(s) URL)? Değilse emoji/glif. */
export function isImageSrc(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.startsWith('/') && !s.startsWith('//')) return true;
  return /^https?:\/\/[^\s]+$/i.test(s);
}

const isoDate = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Geçerli bir tarih girin');

// ───────────────────────── Ödüller ─────────────────────────

export const REWARD_TYPES = ['digital', 'physical', 'coupon'] as const;
export type RewardType = (typeof REWARD_TYPES)[number];
/** "Kupon" abonelik indirim kuponlarıyla karışıyordu (B15) → "Partner kuponu". */
export const REWARD_TYPE_LABEL: Record<RewardType, string> = {
  digital: 'Dijital',
  physical: 'Fiziksel',
  coupon: 'Partner kuponu',
};
export const REWARD_TYPE_HINT: Record<RewardType, string> = {
  digital: 'Müşteriye tek kullanımlık kod verilir; bayi kasasında okutulabilir.',
  physical: 'Talep “Talepler” sekmesine düşer; teslim edince “Teslim edildi” işaretleyin.',
  coupon: 'İsterseniz partnerin verdiği kodları “Kod havuzu”na yükleyin; her talep havuzdan bir kod alır.',
};

export const LOW_STOCK_THRESHOLD = 10;

export const rewardUpsertSchema = z
  .object({
    name: z.string().trim().min(1, 'Ödül adı gerekli').max(50, 'En fazla 50 karakter'),
    description: z.string().trim().min(1, 'Açıklama gerekli').max(200, 'En fazla 200 karakter'),
    icon: z
      .string()
      .trim()
      .min(1, 'İkon gerekli')
      .max(500, 'İkon çok uzun')
      .refine((v) => isImageSrc(v) || [...v].length <= 4, 'Bir emoji ya da yüklenmiş görsel adresi girin'),
    cost: z.coerce
      .number({ invalid_type_error: 'Puan maliyeti sayı olmalı' })
      .int('Tam sayı girin')
      .min(1, 'Maliyet en az 1 puan olmalı')
      .max(1_000_000, 'En fazla 1.000.000 puan'),
    /** -1 = sınırsız. */
    stock: z.coerce
      .number({ invalid_type_error: 'Stok sayı olmalı' })
      .int('Tam sayı girin')
      .min(-1, 'Sınırsız için -1, aksi hâlde 0 veya üstü')
      .max(1_000_000),
    type: z.enum(REWARD_TYPES, { errorMap: () => ({ message: 'Tür seçin' }) }),
    /** Varsayılan TASLAK (B7): yarım ödül canlıya düşmez. */
    isActive: z.boolean().default(false),
    perUserLimit: z.coerce.number().int().min(1, 'En az 1').max(1000).nullable().default(null),
    validFrom: isoDate.nullable().default(null),
    validUntil: isoDate.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.validFrom && v.validUntil && Date.parse(v.validFrom) >= Date.parse(v.validUntil)) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Bitiş, başlangıçtan sonra olmalı' });
    }
  });
export type RewardUpsertInput = z.input<typeof rewardUpsertSchema>;
export type RewardUpsertValues = z.output<typeof rewardUpsertSchema>;

/** Düzenleme: yalnız değişen alanlar + iyimser kilit (B6). */
export const rewardPatchSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  changes: z.record(z.unknown()),
});
export type RewardPatchInput = z.infer<typeof rewardPatchSchema>;

export const rewardActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish') }),
  z.object({ action: z.literal('unpublish') }),
  z.object({ action: z.literal('archive') }),
  z.object({ action: z.literal('restore') }),
  z.object({ action: z.literal('duplicate') }),
  /** Stok hareketi: göreli (eşzamanlı talepleri ezmez). */
  z.object({ action: z.literal('stock'), delta: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'Sıfır olamaz') }),
  z.object({ action: z.literal('unlimited'), unlimited: z.boolean() }),
]);
export type RewardActionInput = z.infer<typeof rewardActionSchema>;

export const REWARD_STATUSES = ['published', 'draft', 'scheduled', 'expired', 'archived'] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];
export const REWARD_STATUS_LABEL: Record<RewardStatus, string> = {
  published: 'Yayında',
  draft: 'Taslak',
  scheduled: 'Zamanlanmış',
  expired: 'Süresi doldu',
  archived: 'Arşivde',
};

export const REWARD_FILTERS = ['published', 'draft', 'scheduled', 'expired', 'archived', 'soldout', 'low'] as const;
export const REWARD_SORTS = ['cost', '-cost', 'name', '-name', 'claims30d', '-claims30d', 'created', '-created', 'stock', '-stock'] as const;

export const rewardListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(REWARD_FILTERS).optional(),
  type: z.enum(REWARD_TYPES).optional(),
  sort: z.enum(REWARD_SORTS).optional(),
  ...pageFields,
});
export type RewardListQuery = z.infer<typeof rewardListQuerySchema>;

export interface RewardRulesDTO {
  perUserLimit: number | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface RewardListItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  stock: number;
  type: RewardType;
  isActive: boolean;
  status: RewardStatus;
  rules: RewardRulesDTO;
  claimsTotal: number;
  claims30d: number;
  pending: number;
  pool: { enabled: boolean; remaining: number };
  updatedAt: string;
  createdAt: string;
}

export interface RewardStats {
  published: number;
  draft: number;
  archived: number;
  soldOut: number;
  low: number;
  pendingFulfilment: number;
  claims30d: number;
  spent30d: number;
  refunds30d: number;
  asOf: string;
}

export interface RewardDetail {
  item: RewardListItem;
  series: DayPoint[];
  recent: RedemptionItem[];
  history: AuditRow[];
  poolCodes: string[];
}

// ───────────────────────── Kod havuzu ─────────────────────────

export const POOL_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
export const POOL_MAX = 5000;

export const poolActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), codes: z.array(z.string().trim()).min(1, 'En az bir kod girin').max(2000, 'Tek seferde en fazla 2000 kod') }),
  z.object({ action: z.literal('remove'), code: z.string().trim().min(1) }),
  z.object({ action: z.literal('disable') }),
]);
export type PoolActionInput = z.infer<typeof poolActionSchema>;

/** Yapıştırılan metni kodlara böler (satır, virgül, noktalı virgül, boşluk). */
export function splitCodes(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface PoolResult {
  added: number;
  skipped: Array<{ code: string; reason: 'invalid' | 'duplicate' | 'issued' }>;
  remaining: number;
}

// ───────────────────────── Talepler ─────────────────────────

export const REDEMPTION_STATUSES = ['pending', 'fulfilled', 'cancelled'] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];
export const REDEMPTION_STATUS_LABEL: Record<RedemptionStatus, string> = {
  pending: 'Bekliyor',
  fulfilled: 'Teslim edildi / kullanıldı',
  cancelled: 'İptal edildi',
};

export const redemptionListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(REDEMPTION_STATUSES).optional(),
  type: z.enum(REWARD_TYPES).optional(),
  rewardId: z.string().trim().max(64).optional(),
  ...pageFields,
});
export type RedemptionListQuery = z.infer<typeof redemptionListQuerySchema>;

export interface RedemptionItem {
  id: string;
  code: string | null;
  status: RedemptionStatus;
  redeemedAt: string;
  claimedAt: string | null;
  /** Talep anında defterden düşülen puan (admin hediyesinde 0). */
  paidPoints: number;
  refundedPoints: number;
  user: { id: string; name: string | null; email: string | null };
  reward: { id: string; name: string; type: RewardType; icon: string };
}

export interface RedemptionStats {
  pending: number;
  pendingPhysical: number;
  fulfilled30d: number;
  cancelled30d: number;
}

export const redemptionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fulfil'), note: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().min(3, 'Kısa bir gerekçe yazın').max(200) }),
]);
export type RedemptionActionInput = z.infer<typeof redemptionActionSchema>;

// ───────────────────────── Kozmetik ─────────────────────────

export const COSMETIC_TYPES = ['avatar_frame', 'profile_badge', 'profile_background'] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];
export const COSMETIC_TYPE_LABEL: Record<CosmeticType, string> = {
  avatar_frame: 'Avatar çerçevesi',
  profile_badge: 'Profil rozeti',
  profile_background: 'Profil arka planı',
};

export const COSMETIC_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type CosmeticRarity = (typeof COSMETIC_RARITIES)[number];
export const COSMETIC_RARITY_LABEL: Record<CosmeticRarity, string> = {
  common: 'Yaygın',
  rare: 'Nadir',
  epic: 'Destansı',
  legendary: 'Efsanevi',
};
export const COSMETIC_RARITY_RANK: Record<CosmeticRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** `components/ui/avatar-frame.tsx` UserAvatarFrame'in tanıdığı efektler (müşteride aynı yorum). */
export const FRAME_EFFECTS = [
  { id: 'fire_effect', label: 'Cehennem ateşi' },
  { id: 'space_effect', label: 'Kozmik uzay' },
  { id: 'cyberpunk_effect', label: 'Siber neon' },
  { id: 'crown_effect', label: 'Altın taç' },
  { id: 'glitch_effect', label: 'Glitch' },
  { id: 'toxic_effect', label: 'Toksik' },
] as const;
export const BADGE_PRESETS = [
  { id: 'diamond_badge', label: 'Elmas' },
  { id: 'ruby_badge', label: 'Yakut' },
] as const;
const FRAME_IDS: ReadonlySet<string> = new Set(FRAME_EFFECTS.map((f) => f.id));
const BADGE_IDS: ReadonlySet<string> = new Set(BADGE_PRESETS.map((b) => b.id));

/**
 * `imageUrl` tek alanda dört anlam taşıyordu (Bulgu 3). Artık türe göre tek, doğrulanan
 * sözleşme: çerçeve → efekt kimliği; rozet → hazır rozet ya da görsel; arka plan → görsel.
 * (Veritabanından gelen Tailwind sınıfı derlenmediği için yeni arka plan sınıf olamaz.)
 */
export function cosmeticAssetError(type: CosmeticType, asset: string | null | undefined): string | null {
  const v = (asset ?? '').trim();
  if (type === 'avatar_frame') return FRAME_IDS.has(v) ? null : 'Galeriden bir çerçeve efekti seçin';
  if (type === 'profile_badge') return BADGE_IDS.has(v) || isImageSrc(v) ? null : 'Hazır bir rozet seçin ya da görsel yükleyin';
  return isImageSrc(v) ? null : 'Arka plan için bir görsel yükleyin';
}

export function slugify(name: string): string {
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const cosmeticBase = z.object({
  name: z.string().trim().min(1, 'Ürün adı gerekli').max(200, 'En fazla 200 karakter'),
  slug: z
    .string()
    .trim()
    .max(80, 'En fazla 80 karakter')
    .regex(/^[a-z0-9-]*$/, 'Yalnız küçük harf, rakam ve tire')
    .nullable()
    .default(null),
  description: z.string().trim().max(2000, 'En fazla 2000 karakter').nullable().default(null),
  type: z.enum(COSMETIC_TYPES, { errorMap: () => ({ message: 'Tür seçin' }) }),
  price: z.coerce
    .number({ invalid_type_error: 'Fiyat sayı olmalı' })
    .int('Tam sayı girin')
    .min(0, 'Fiyat negatif olamaz')
    .max(10_000_000, 'En fazla 10.000.000 puan'),
  asset: z.string().trim().max(2000),
  rarity: z.enum(COSMETIC_RARITIES, { errorMap: () => ({ message: 'Nadirlik seçin' }) }),
  isActive: z.boolean().default(false),
});

export const cosmeticUpsertSchema = cosmeticBase.superRefine((v, ctx) => {
  const err = cosmeticAssetError(v.type, v.asset);
  if (err) ctx.addIssue({ code: 'custom', path: ['asset'], message: err });
});
export type CosmeticUpsertInput = z.input<typeof cosmeticUpsertSchema>;
export type CosmeticUpsertValues = z.output<typeof cosmeticUpsertSchema>;

/** Düzenleme: değişen alanlar + yüklendiği andaki değerleri (iyimser kilit; şemada updatedAt yok). */
export const cosmeticPatchSchema = z.object({
  expected: z.record(z.unknown()),
  changes: z.record(z.unknown()),
});
export type CosmeticPatchInput = z.infer<typeof cosmeticPatchSchema>;

export const cosmeticActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('deactivate') }),
  z.object({ action: z.literal('archive') }),
  z.object({ action: z.literal('restore') }),
  z.object({ action: z.literal('duplicate') }),
]);
export type CosmeticActionInput = z.infer<typeof cosmeticActionSchema>;

export const COSMETIC_FILTERS = ['active', 'inactive', 'archived'] as const;
export const COSMETIC_SORTS = ['price', '-price', 'name', '-name', 'owners', '-owners', 'sales30d', '-sales30d', 'rarity', '-rarity', 'created', '-created'] as const;

export const cosmeticListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(COSMETIC_FILTERS).optional(),
  type: z.enum(COSMETIC_TYPES).optional(),
  rarity: z.enum(COSMETIC_RARITIES).optional(),
  sort: z.enum(COSMETIC_SORTS).optional(),
  ...pageFields,
});
export type CosmeticListQuery = z.infer<typeof cosmeticListQuerySchema>;

export type CosmeticStatus = 'active' | 'inactive' | 'archived';

export interface CosmeticListItem {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  type: CosmeticType | 'other';
  price: number;
  /** Ham `imageUrl` (türe göre efekt/preset/görsel). */
  asset: string | null;
  /** Kayıt yeni sözleşmeye uymuyorsa neden (eski sınıf tabanlı arka plan vb.). */
  assetWarning: string | null;
  rarity: CosmeticRarity;
  rarityRaw: string;
  status: CosmeticStatus;
  isActive: boolean;
  owners: number;
  equipped: number;
  sales30d: number;
  gifts30d: number;
  createdAt: string;
}

export interface CosmeticStats {
  active: number;
  inactive: number;
  archived: number;
  sales30d: number;
  burned30d: number;
  topSeller: { id: string; name: string; count: number } | null;
  demoMissing: number;
  nonStandard: number;
  asOf: string;
}

export interface CosmeticDetail {
  item: CosmeticListItem;
  series: DayPoint[];
  recentOwners: Array<{ userId: string; name: string | null; email: string | null; acquiredAt: string; gifted: boolean; equipped: boolean }>;
  history: AuditRow[];
}

export interface SeedResult {
  added: string[];
}

// ───────────────────────── Sorgu dizesi ─────────────────────────

export function buildQs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  sp.sort();
  return sp.toString();
}

/** DataTable sıralaması ("cost" / "-cost") ↔ sunucu enum'u. */
export function sortParam(sort: string | null | undefined, allowed: readonly string[]): string | undefined {
  if (!sort) return undefined;
  const first = sort.split(',')[0]?.trim();
  if (!first) return undefined;
  const norm = first.endsWith('.desc') ? `-${first.slice(0, -5)}` : first.replace(/\.asc$/, '');
  return allowed.includes(norm) ? norm : undefined;
}

/** İstemci sorgu anahtarı ile sunucu ön yüklemesi AYNI dizeyi üretir (initialData eşleşmesi). */
export function rewardsQs(values: { q?: string; status?: string; type?: string; sort?: string | null; page: number; size: number }) {
  return buildQs({
    q: values.q && values.q.length >= 2 ? values.q : null,
    status: values.status || null,
    type: values.type || null,
    sort: sortParam(values.sort, REWARD_SORTS) ?? null,
    page: values.page > 1 ? values.page : null,
    size: values.size !== STORE_PAGE_SIZE ? values.size : null,
  });
}

export function cosmeticsQs(v: { q?: string; type?: string; status?: string; rarity?: string; sort?: string | null; page: number; size: number }) {
  return buildQs({
    q: v.q && v.q.length >= 2 ? v.q : null,
    type: v.type || null,
    status: v.status || null,
    rarity: v.rarity || null,
    sort: sortParam(v.sort, COSMETIC_SORTS) ?? null,
    page: v.page > 1 ? v.page : null,
    size: v.size !== STORE_PAGE_SIZE ? v.size : null,
  });
}
