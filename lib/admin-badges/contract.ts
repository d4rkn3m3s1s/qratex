/**
 * Rozetler merkezi (/admin/badges) — istemci + sunucu ORTAK sözleşme: zod şemaları, sabitler,
 * DTO tipleri. Prisma'ya bağımlı değildir (istemci paketine girer).
 *
 * Üç kavram AYRI tutulur (rapor Bulgu 2):
 *  - `rewardPoints`  → rozet kazanılınca yatan puan (kod içi metin tablolarından, SALT-OKUNUR)
 *  - `targetValue`   → kazanma koşulunun hedef sayısı (ör. 10 yorum)
 *  - `pointCost`     → eski "puanla aç" maliyeti; satın alma kapalı (410), formda yok
 */
import { z } from 'zod';
import { REQUIREMENT_TYPE_OPTIONS, type Trackability } from '@/lib/badge-trackability';

// ───────────────────────────── Taksonomi ─────────────────────────────

export const BADGE_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type BadgeRarity = (typeof BADGE_RARITIES)[number];
/** Sıralama için anlamlı nadirlik sırası (sözlük sırası değil). */
export const RARITY_RANK: Record<BadgeRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Yaygın',
  rare: 'Nadir',
  epic: 'Epik',
  legendary: 'Efsanevi',
};

export function normalizeRarity(v: unknown): BadgeRarity {
  const s = String(v ?? '').toLowerCase();
  return (BADGE_RARITIES as readonly string[]).includes(s) ? (s as BadgeRarity) : 'common';
}

/** Tek doğruluk kaynağı: rozet kategorileri (gamification ucunun takma ad tablosuyla uyumlu). */
export const BADGE_CATEGORIES = [
  { value: 'general', label: 'Genel' },
  { value: 'feedback', label: 'Geri bildirim' },
  { value: 'engagement', label: 'Etkileşim' },
  { value: 'streak', label: 'Seri' },
  { value: 'speed', label: 'Hız' },
  { value: 'exploration', label: 'Keşif' },
  { value: 'expertise', label: 'Uzmanlık' },
  { value: 'rating', label: 'Puanlama' },
  { value: 'sadakat', label: 'Sadakat' },
  { value: 'etkinlik', label: 'Etkinlik' },
  { value: 'special', label: 'Özel' },
  { value: 'custom', label: 'Özel (eski)' },
  { value: 'diger', label: 'Diğer' },
  { value: 'dizi', label: 'Dizi' },
] as const;
export type BadgeCategory = (typeof BADGE_CATEGORIES)[number]['value'];
const CATEGORY_VALUES = BADGE_CATEGORIES.map((c) => c.value) as [BadgeCategory, ...BadgeCategory[]];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(BADGE_CATEGORIES.map((c) => [c.value, c.label]));

export function normalizeCategory(v: unknown): BadgeCategory {
  const s = String(v ?? '').trim().toLowerCase();
  return (CATEGORY_VALUES as readonly string[]).includes(s) ? (s as BadgeCategory) : 'general';
}

/** Formda seçilebilen koşul tipleri (izlenebilir olanlar). */
export const REQUIREMENT_TYPES = REQUIREMENT_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]];
export const REQUIREMENT_LABEL: Record<string, string> = Object.fromEntries(
  REQUIREMENT_TYPE_OPTIONS.map((o) => [o.value, o.label.replace(/\s*\(~yaklaşık\)$/, '')])
);
export function requirementLabel(type: string | null | undefined): string {
  if (!type) return 'Tanımsız';
  if (type === 'character') return 'Karakter motoru';
  return REQUIREMENT_LABEL[type] ?? `Bilinmeyen koşul (${type})`;
}

export const TRACKABILITY_LABEL: Record<Trackability, string> = {
  exact: 'Tam izlenebilir',
  approximate: 'Yaklaşık',
  character: 'Karakter motoru',
  untrackable: 'İzlenemez',
};

// ───────────────────────────── Liste ─────────────────────────────

export const BADGE_TABS = ['normal', 'series'] as const;
export type BadgeTab = (typeof BADGE_TABS)[number];

/** Sağlık/durum süzgeci — KPI çipleri bu değerleri URL'ye yazar. */
export const BADGE_HEALTH_FILTERS = [
  'active',
  'inactive',
  'archived',
  'never',
  'exact',
  'approximate',
  'untrackable',
] as const;
export type BadgeHealthFilter = (typeof BADGE_HEALTH_FILTERS)[number];

export const BADGE_SORT_IDS = ['name', 'rarity', 'earned', 'recent', 'lastEarned', 'createdAt'] as const;
export type BadgeSortId = (typeof BADGE_SORT_IDS)[number];
export const BADGE_DEFAULT_SORT = 'rarity.desc';
export const BADGE_PAGE_SIZE = 25;

const trimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const badgeListQuerySchema = z.object({
  tab: z.enum(BADGE_TABS).catch('normal').default('normal'),
  series: trimmed(40),
  q: trimmed(80),
  rarity: z.enum(BADGE_RARITIES).optional().catch(undefined),
  health: z.enum(BADGE_HEALTH_FILTERS).optional().catch(undefined),
  sort: z
    .string()
    .trim()
    .regex(/^[A-Za-z]+\.(asc|desc)$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(5).max(100).catch(BADGE_PAGE_SIZE).default(BADGE_PAGE_SIZE),
});
export type BadgeListQuery = z.infer<typeof badgeListQuerySchema>;

export type BadgeStatus = 'active' | 'inactive' | 'archived';

export type BadgeListItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: BadgeRarity;
  requirementType: string;
  targetValue: number;
  trackability: Trackability;
  rewardPoints: number;
  status: BadgeStatus;
  isCharacter: boolean;
  seriesKey: string | null;
  seriesName: string | null;
  color: string | null;
  bgColor: string | null;
  earnedCount: number;
  earned30d: number;
  lastEarnedAt: string | null;
  createdAt: string;
};

export type BadgeListPage = { items: BadgeListItem[]; total: number; page: number; size: number };

export type BadgeHealthCounts = {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  never: number;
  exact: number;
  approximate: number;
  untrackable: number;
};

export type BadgeStats = {
  normal: BadgeHealthCounts;
  series: BadgeHealthCounts;
  rarity: Record<BadgeRarity, number>;
  totalEarned: number;
  earned30d: number;
  /** Katalogda tanımlı ama DB'de kaydı olmayan karakterler (ilk kazanımda oluşturulur). */
  charactersWithoutRecord: number;
  seriesCategories: Array<{ key: string; name: string; emoji: string; count: number }>;
};

// ───────────────────────────── Detay ─────────────────────────────

export type BadgeAuditRow = {
  id: string;
  action: string;
  at: string;
  actor: string | null;
  summary: string | null;
};

export type BadgeEarner = { userId: string; name: string | null; email: string | null; earnedAt: string };

export type BadgeDetail = BadgeListItem & {
  requirementPeriod: string | null;
  hiddenUntilEarned: boolean;
  pointCost: number | null;
  archivedAt: string | null;
  updatedAt: string;
  /** Son 30 gün, Europe/Istanbul gününe göre kazanım sayısı (eskiden yeniye). */
  series30: Array<{ day: string; count: number }>;
  recentEarners: BadgeEarner[];
  audit: BadgeAuditRow[];
  /** Karakter rozetlerinde reveal metni var mı (yoksa reveal dahili ipucunu gösterir). */
  hasRevealText: boolean | null;
};

// ───────────────────────────── Yazma ─────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexOrNull = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || HEX.test(v), { message: 'Renk #RRGGBB biçiminde olmalı.' });

/** İkon: yerel yol (/images/...), HTTPS URL (R2) ya da kısa emoji. */
export const badgeIconSchema = z
  .string()
  .trim()
  .min(1, 'Bir ikon seçin ya da yükleyin.')
  .max(500)
  .refine((v) => v.startsWith('/') || /^https:\/\//i.test(v) || [...v].length <= 4, {
    message: 'İkon yerel bir yol, HTTPS adresi ya da tek emoji olmalı.',
  });

export const badgeUpsertSchema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı.').max(60, 'Ad en fazla 60 karakter olabilir.'),
  description: z.string().trim().max(300, 'Açıklama en fazla 300 karakter olabilir.').default(''),
  icon: badgeIconSchema,
  category: z.enum(CATEGORY_VALUES),
  rarity: z.enum(BADGE_RARITIES),
  requirementType: z.enum(REQUIREMENT_TYPES, { errorMap: () => ({ message: 'Geçerli bir koşul seçin.' }) }),
  targetValue: z.coerce
    .number({ invalid_type_error: 'Hedef bir sayı olmalı.' })
    .int('Hedef tam sayı olmalı.')
    .min(1, 'Hedef en az 1 olmalı.')
    .max(1_000_000, 'Hedef çok büyük.'),
  isActive: z.boolean().default(true),
  color: hexOrNull,
  bgColor: hexOrNull,
});
export type BadgeUpsertInput = z.input<typeof badgeUpsertSchema>;
export type BadgeUpsertValues = z.output<typeof badgeUpsertSchema>;

/**
 * Karakter rozetlerinde koşul motor tarafından belirlenir — yalnız görünüm ve aktiflik
 * düzenlenir. (Ad/açıklama da katalogla birlikte reveal metninde görünür; düzenlenebilir.)
 */
export const characterBadgePatchSchema = badgeUpsertSchema
  .pick({ name: true, description: true, icon: true, rarity: true, isActive: true, color: true, bgColor: true });

export const BADGE_ACTIONS = ['archive', 'restore', 'duplicate', 'grant'] as const;

export const badgeActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('archive'), dryRun: z.boolean().optional(), confirm: z.boolean().optional() }),
  z.object({ action: z.literal('restore') }),
  z.object({ action: z.literal('duplicate') }),
  z.object({
    action: z.literal('grant'),
    email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin.').max(200),
    reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(300),
  }),
]);
export type BadgeActionInput = z.infer<typeof badgeActionSchema>;

export type ArchiveImpact = {
  earnedBy: number;
  blockers: string[];
  requiresConfirm: boolean;
};

export type BadgeActionResult =
  | { action: 'archive'; dryRun: true; impact: ArchiveImpact }
  | { action: 'archive'; dryRun?: false; archived: true; impact: ArchiveImpact }
  | { action: 'restore'; restored: true }
  | { action: 'duplicate'; id: string }
  | { action: 'grant'; userId: string; awarded: boolean; reason?: string };

export const BULK_ACTIONS = ['activate', 'deactivate', 'archive'] as const;
export const badgeBulkSchema = z.object({
  action: z.enum(BULK_ACTIONS),
  ids: z.array(z.string().trim().min(1).max(64)).min(1, 'En az bir rozet seçin.').max(100, 'Tek seferde en fazla 100 rozet.'),
  confirm: z.boolean().optional(),
});
export type BadgeBulkInput = z.infer<typeof badgeBulkSchema>;
export type BadgeBulkResult = { action: (typeof BULK_ACTIONS)[number]; changed: number; skipped: Array<{ id: string; reason: string }> };

// ───────────────────────────── Eşikler ─────────────────────────────

/** Aralıklar tek kaynaktan: sunucu doğrulaması + UI min/max + ipucu (rapor Bulgu 2). */
export const THRESHOLD_LIMITS = {
  threshold: { min: 3, max: 100, aggressiveBelow: 4 },
  minReviewLength: { min: 0, max: 2000, heavyAbove: 0 },
} as const;

const thresholdEntry = z
  .object({
    threshold: z
      .number()
      .int('Eşik tam sayı olmalı.')
      .min(THRESHOLD_LIMITS.threshold.min, `Eşik en az ${THRESHOLD_LIMITS.threshold.min} olmalı.`)
      .max(THRESHOLD_LIMITS.threshold.max, `Eşik en fazla ${THRESHOLD_LIMITS.threshold.max} olabilir.`)
      .optional(),
    minReviewLength: z
      .number()
      .int('Uzunluk tam sayı olmalı.')
      .min(THRESHOLD_LIMITS.minReviewLength.min, 'Uzunluk negatif olamaz.')
      .max(THRESHOLD_LIMITS.minReviewLength.max, `Uzunluk en fazla ${THRESHOLD_LIMITS.minReviewLength.max} olabilir.`)
      .optional(),
  })
  .strict();

export const thresholdOverridesSchema = z.record(z.string().min(1).max(40), thresholdEntry);
export type ThresholdOverrides = z.infer<typeof thresholdOverridesSchema>;

export const thresholdsPutSchema = z.object({
  overrides: thresholdOverridesSchema,
  baseVersion: z.string().min(1).max(200),
  /** Geçmişten geri dönüşte hangi denetim kaydından (yalnız denetim izi için). */
  revertOf: z.string().max(64).optional(),
});
export const thresholdsPreviewSchema = z.object({ overrides: thresholdOverridesSchema });

export type ThresholdCategoryRow = {
  key: string;
  name: string;
  emoji: string;
  accent: string;
  description: string;
  characterCount: number;
  defaultThreshold: number;
  defaultMinReviewLength: number;
  effectiveThreshold: number;
  effectiveMinReviewLength: number;
};

export type ThresholdsState = {
  categories: ThresholdCategoryRow[];
  overrides: ThresholdOverrides;
  version: string;
  updatedAt: string | null;
  lastChange: { at: string; actor: string | null } | null;
};

export type ThresholdImpactRow = {
  key: string;
  /** Şu an "hazır" bekleyen kullanıcı. */
  readyNow: number;
  /** Taslak uygulanınca hazır olacak kullanıcı. */
  readyAfter: number;
  /** Hazır değilken hazır hale gelecek kullanıcı. */
  newlyReady: number;
  /** Hazırken hazır olmaktan çıkacak kullanıcı (okunmamış "hazır" bildirimi yalan söyler). */
  regressed: number;
  /** Bugünkü sayımla açılabilecek ek rozet (taslak − mevcut, karakter sınırıyla). */
  extraReveals: number;
  /** Ek rozetlerin tahmini ödül puanı (kategorinin ortalama karakter ödülü × ek rozet). */
  extraPointsEstimate: number;
  /** Taslak eşikle mevcut döngü ilerleme dağılımı: [0-25%, 25-50, 50-75, 75-<100, hazır]. */
  histogram: [number, number, number, number, number];
  /** Kategoride yorumu olan kullanıcı. */
  users: number;
};

export type ThresholdImpact = { rows: ThresholdImpactRow[]; computedAt: string; usersScanned: number };

export type ThresholdHistoryRow = {
  id: string;
  at: string;
  actor: string | null;
  before: ThresholdOverrides;
  after: ThresholdOverrides;
  revertOf: string | null;
};
export type ThresholdHistoryPage = { items: ThresholdHistoryRow[]; total: number; page: number; size: number };

// ───────────────────────────── Test laboratuvarı ─────────────────────────────

export const labTargetQuerySchema = z.object({ user: z.string().trim().min(1).max(200) });
export const labTargetsQuerySchema = z.object({ q: trimmed(80) });

export const labClassifySchema = z.object({
  text: z.string().trim().min(3, 'Yorum en az 3 karakter olmalı.').max(1000, 'Yorum en fazla 1000 karakter olabilir.'),
});

export const labPreviewSchema = z.object({
  badgeId: z.string().trim().min(1).max(64),
  why: z.string().trim().max(300).optional(),
  ratePct: z.number().min(0).max(100).nullable().optional(),
});

export const LAB_SANDBOX_ACTIONS = ['fill', 'reset', 'clearCategories', 'cleanupTest'] as const;
export const labSandboxSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fill'), user: z.string().trim().min(1).max(200), category: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal('reset'), user: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal('clearCategories'), user: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal('cleanupTest'), user: z.string().trim().min(1).max(200) }),
]);
export type LabSandboxInput = z.infer<typeof labSandboxSchema>;

export type LabCategoryProgress = {
  key: string;
  name: string;
  emoji: string;
  threshold: number;
  minReviewLength: number;
  counted: number;
  taken: number;
  available: number;
  current: number;
  ready: boolean;
  targetForNext: number;
};

export type LabTarget = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  isDemo: boolean;
  allowed: boolean;
};

export type LabStatus = {
  target: LabTarget;
  mutationsEnabled: boolean;
  categories: LabCategoryProgress[];
  ownedCharacters: Array<{ badgeId: string; name: string; categoryKey: string | null; earnedAt: string }>;
  synthetic: { consumptions: number; cards: number };
};

export type LabCharacterOption = {
  badgeId: string;
  name: string;
  categoryKey: string;
  categoryName: string;
  tier: 'common' | 'rare' | 'legendary' | null;
  rewardPoints: number;
  hasRevealText: boolean;
  hasRecord: boolean;
  isActive: boolean;
  holders: number;
};

export type LabCatalog = {
  categories: Array<{ key: string; name: string; emoji: string; accent: string }>;
  characters: LabCharacterOption[];
  unassigned: string[];
  totalCustomers: number;
};

export type LabClassifyResult = {
  category: { key: string; name: string; emoji: string } | null;
  reason: 'ok' | 'too_short' | 'unclassified';
  character: { badgeId: string; name: string; why: string; source: 'ai' | 'fallback'; aiError?: string } | null;
  latencyMs: number;
};

export type LabRevealCharacter = {
  badgeId: string;
  name: string;
  why: string;
  icon?: string;
  description?: string;
  rarity: string;
  holders: number;
  ratePct: number | null;
  category: { key: string; name: string; emoji: string; accent: string; description: string } | null;
};

export type LabSandboxResult = {
  action: (typeof LAB_SANDBOX_ACTIONS)[number];
  message: string;
  counts: Record<string, number>;
  status: LabStatus;
};
