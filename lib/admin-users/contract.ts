/**
 * Admin → Kullanıcılar (+ Kullanıcı 360) sözleşmesi — istemci ve sunucu ortak.
 *
 * Bu dosya Prisma içermez (istemci paketine girer). Sunucu mantığı:
 *  - `lib/admin-users/list.server.ts`    liste, filtre, sıralama, KPI, CSV
 *  - `lib/admin-users/detail.server.ts`  360 özeti + sekme verileri (defter, rozet, yorum, denetim)
 *  - `lib/admin-users/actions.server.ts` rol, askıya alma, oturum, bildirim, rozet, ödül, profil
 *
 * Kurallar (docs/audit/2026-10-08/admin/admin_users.md):
 *  - Kalıcı silme yok: askıya alma (geri alınabilir) ya da KVKK anonimleştirmesi.
 *  - Puan/XP yalnız `adjustPointsByAdmin` (gerekçe + tavan + eşik üstü ikinci onay).
 *  - Rol STAFF yalnız bayi davetiyle verilir; ADMIN'e yükseltme dört göz ister.
 */
import { z } from 'zod';

// ───────────────────────────── Sözlükler ─────────────────────────────

export const USER_ROLES = ['ADMIN', 'DEALER', 'CUSTOMER', 'STAFF'] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** Yöneticinin doğrudan atayabildiği roller (STAFF bayi davetiyle gelir). */
export const ASSIGNABLE_ROLES = ['ADMIN', 'DEALER', 'CUSTOMER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'anonymized'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const TRUST_TIERS = ['trusted', 'neutral', 'watch', 'low'] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export const FRAUD_STATUSES = ['clean', 'flagged', 'shadow_ban'] as const;
export type FraudStatus = (typeof FRAUD_STATUSES)[number];

export const LIST_SORT_IDS = ['createdAt', 'points', 'level', 'name', 'trustScore'] as const;
export type ListSortId = (typeof LIST_SORT_IDS)[number];
export const LIST_DEFAULT_SORT = 'createdAt.desc';
export const LIST_PAGE_SIZES = [10, 20, 50, 100] as const;
export const LIST_DEFAULT_PAGE_SIZE = 20;
/** Sunucu CSV dışa aktarımının satır tavanı. */
export const EXPORT_MAX_ROWS = 10_000;

// ───────────────────────────── Liste sorgusu ─────────────────────────────

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const listQuerySchema = z.object({
  q: z.preprocess((v) => emptyToUndef(first(v)), z.string().trim().max(100).optional()),
  role: z.preprocess((v) => emptyToUndef(first(v)), z.enum(USER_ROLES).optional()),
  status: z.preprocess((v) => emptyToUndef(first(v)), z.enum(USER_STATUSES).optional()),
  trust: z.preprocess((v) => emptyToUndef(first(v)), z.enum(TRUST_TIERS).optional()),
  fraud: z.preprocess((v) => emptyToUndef(first(v)), z.enum(FRAUD_STATUSES).optional()),
  plan: z.preprocess((v) => emptyToUndef(first(v)), z.enum(['has', 'none']).optional()),
  verified: z.preprocess((v) => emptyToUndef(first(v)), z.enum(['yes', 'no']).optional()),
  sort: z.preprocess((v) => emptyToUndef(first(v)), z.string().max(40).optional()),
  page: z.preprocess((v) => emptyToUndef(first(v)), z.coerce.number().int().min(1).max(100_000).default(1)),
  size: z.preprocess(
    (v) => emptyToUndef(first(v)),
    z.coerce
      .number()
      .int()
      .refine((n) => (LIST_PAGE_SIZES as readonly number[]).includes(n), 'Geçersiz sayfa boyutu')
      .default(LIST_DEFAULT_PAGE_SIZE)
  ),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface ParsedSort {
  id: ListSortId;
  desc: boolean;
}

/** `createdAt.desc` → güvenli sıralama; izin dışı alan varsayılana düşer. */
export function parseListSort(raw: string | null | undefined): ParsedSort {
  const [id, dir] = String(raw || LIST_DEFAULT_SORT).split(',')[0].split('.');
  if ((LIST_SORT_IDS as readonly string[]).includes(id)) return { id: id as ListSortId, desc: dir !== 'asc' };
  return { id: 'createdAt', desc: true };
}

/** Arama 2 karakterden kısaysa yok sayılır (tek harfle tüm tabloyu taramaz). */
export function normalizeSearch(q: string | undefined | null): string {
  const s = (q ?? '').trim().replace(/\s+/g, ' ');
  return s.length >= 2 ? s.slice(0, 100) : '';
}

// ───────────────────────────── DTO'lar ─────────────────────────────

export interface UserListItem {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  status: UserStatus;
  points: number;
  level: number;
  xp: number;
  trustScore: number;
  trustTier: string;
  fraudStatus: string;
  emailVerified: boolean;
  isDemo: boolean;
  businessName: string | null;
  planName: string | null;
  /** STAFF ise bağlı olduğu işletme. */
  staffOf: string | null;
  feedbackCount: number;
  badgeCount: number;
  createdAt: string;
}

export interface UserListPage {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface UsersStats {
  /** Anonimleştirilmemiş hesaplar. */
  total: number;
  byRole: Record<UserRole, number>;
  suspended: number;
  anonymized: number;
  flagged: number;
  lowTrust: number;
  newLast7d: number;
  calculatedAt: string;
}

export interface User360 {
  viewerId: string;
  isSelf: boolean;
  /** Etkin (askıda/anonim olmayan) yönetici sayısı — son yönetici koruması için. */
  activeAdminCount: number;
  identity: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    phone: string | null;
    role: string;
    status: UserStatus;
    isDemo: boolean;
    emailVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
    suspendedAt: string | null;
    suspendedReason: string | null;
    anonymizedAt: string | null;
    preferredLanguage: string | null;
  };
  gamification: {
    points: number;
    xp: number;
    /** DB'de saklanan seviye. */
    level: number;
    /** XP'den kanonik (geometrik) formülle türeyen seviye. */
    derivedLevel: number;
    /** 0–100 */
    levelProgress: number;
    xpToNextLevel: number;
    loginStreak: number;
    loginStreakLongest: number;
    isHallOfFame: boolean;
  };
  trust: {
    score: number;
    tier: string;
    updatedAt: string | null;
    fraudStatus: string;
    fraudScore: number | null;
    openSuspicious: number;
  };
  security: {
    twoFactorEnabled: boolean;
    sessionVersion: number;
    hasPassword: boolean;
    lastSeenAt: string | null;
  };
  counts: {
    feedbacks: number;
    badges: number;
    rewards: number;
    qrCodes: number;
    consumptions: number;
    unreadNotifications: number;
  };
  dealer: null | {
    businessName: string | null;
    businessDesc: string | null;
    businessCategory: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    plan: { id: string; name: string } | null;
    subscriptionStatus: string | null;
    subscriptionCurrentPeriodEnd: string | null;
    activeQrCodes: number;
    staffCount: number;
  };
  staff: null | {
    dealerId: string;
    dealerName: string | null;
    jobTitle: string | null;
    isActive: boolean;
  };
  team: null | { department: string | null; teamRole: string | null };
  /** Bekleyen ADMIN yükseltme talebi (dört göz). */
  pendingElevation: null | {
    requestId: string;
    requestedAt: string;
    requesterId: string | null;
    requesterLabel: string;
    reason: string;
  };
}

export interface LedgerRow {
  id: string;
  createdAt: string;
  currency: string;
  delta: number;
  xpDelta: number;
  balanceAfter: number | null;
  source: string;
  status: string;
  reason: string | null;
  actorLabel: string | null;
}

export interface LedgerPage {
  items: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Son 30 gün (İstanbul gününe göre) özet. */
  last30: { earned: number; spent: number; xp: number };
}

export interface EarnedBadge {
  badgeId: string;
  name: string;
  icon: string;
  rarity: string;
  category: string;
  color: string | null;
  hidden: boolean;
  archived: boolean;
  earnedAt: string;
  featured: boolean;
}

export interface CatalogBadge {
  id: string;
  name: string;
  icon: string;
  rarity: string;
  category: string;
  hidden: boolean;
  isActive: boolean;
}

export interface CatalogReward {
  id: string;
  name: string;
  icon: string;
  type: string;
  cost: number;
  /** -1 = sınırsız */
  stock: number;
}

export interface UserRewardRow {
  id: string;
  rewardName: string;
  rewardType: string;
  icon: string;
  /** Kupon kodunun yalnız son 4 karakteri. */
  codeTail: string | null;
  redeemedAt: string;
  claimedAt: string | null;
}

export interface UserFeedbackRow {
  id: string;
  rating: number;
  text: string | null;
  sentiment: string | null;
  isToxic: boolean;
  deleted: boolean;
  dealerName: string | null;
  replied: boolean;
  createdAt: string;
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  /** `subject`: kullanıcı üzerinde yapılan · `actor`: kullanıcının yaptığı. */
  direction: 'subject' | 'actor';
  actorLabel: string;
  summary: string | null;
  createdAt: string;
}

export interface ActivityRow {
  id: string;
  kind: 'event' | 'suspicious';
  title: string;
  detail: string | null;
  severity: string | null;
  resolved: boolean | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// ───────────────────────────── Aksiyon şemaları ─────────────────────────────

const reason = (min: number, max: number, label = 'Gerekçe') =>
  z
    .string({ required_error: `${label} yazın` })
    .trim()
    .min(min, `${label} en az ${min} karakter olmalı`)
    .max(max, `${label} en fazla ${max} karakter olabilir`);

export const ADJUST_PER_OPERATION_MAX = 100_000;
export const ADJUST_SECOND_APPROVAL_ABOVE = 10_000;

export const adjustPointsSchema = z
  .object({
    /** + ekle / − düş */
    delta: z
      .number({ invalid_type_error: 'Puan miktarı sayı olmalı' })
      .int('Puan miktarı tam sayı olmalı')
      .min(-ADJUST_PER_OPERATION_MAX, 'Tek işlemde en fazla 100.000 puan düşülebilir')
      .max(ADJUST_PER_OPERATION_MAX, 'Tek işlemde en fazla 100.000 puan eklenebilir')
      .default(0),
    xp: z
      .number({ invalid_type_error: 'XP sayı olmalı' })
      .int('XP tam sayı olmalı')
      .min(0, 'XP yalnız eklenebilir')
      .max(ADJUST_PER_OPERATION_MAX, 'Tek işlemde en fazla 100.000 XP eklenebilir')
      .default(0),
    reasonCode: z.enum(['support', 'compensation', 'correction', 'campaign', 'fraud_reversal', 'other']),
    note: reason(5, 400, 'Açıklama'),
    approvalToken: z.string().trim().max(4000).optional().nullable(),
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,100}$/, 'Geçersiz istek kimliği')
      .optional()
      .nullable(),
  })
  .refine((v) => v.delta !== 0 || v.xp > 0, { message: 'Puan ya da XP miktarı girin', path: ['delta'] })
  .refine((v) => !(v.delta < 0 && v.xp > 0), { message: 'Puan düşerken aynı işlemde XP eklenemez', path: ['xp'] });
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;

export const REASON_CODE_LABELS: Record<AdjustPointsInput['reasonCode'], string> = {
  support: 'Destek talebi',
  compensation: 'Telafi / gönül alma',
  correction: 'Hatalı işlem düzeltmesi',
  campaign: 'Kampanya / etkinlik',
  fraud_reversal: 'Suistimal geri alımı',
  other: 'Diğer',
};

export const approvalIssueSchema = z.object({
  requesterId: z.string().min(1).max(64),
  delta: z.number().int().min(-ADJUST_PER_OPERATION_MAX).max(ADJUST_PER_OPERATION_MAX),
  xp: z.number().int().min(0).max(ADJUST_PER_OPERATION_MAX).default(0),
  reason: reason(5, 500),
});

export const roleChangeSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES),
  reason: reason(5, 300),
  /** ADMIN'e yükseltmede kullanıcının e-postası yazılarak onaylanır. */
  confirmPhrase: z.string().trim().max(320).optional(),
});

export const elevationDecisionSchema = z.object({
  requestId: z.string().min(1).max(64),
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional(),
});

export const suspensionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: reason(3, 500) }),
  z.object({ action: z.literal('unsuspend'), reason: z.string().trim().max(500).optional() }),
]);

export const notifySchema = z.object({
  title: z.string().trim().min(2, 'Başlık en az 2 karakter olmalı').max(80, 'Başlık en fazla 80 karakter olabilir'),
  message: z.string().trim().min(2, 'Mesaj en az 2 karakter olmalı').max(500, 'Mesaj en fazla 500 karakter olabilir'),
  type: z.enum(['info', 'success', 'warning']).default('info'),
});

export const grantBadgeSchema = z.object({
  badgeId: z.string().min(1).max(64),
  note: z.string().trim().max(300).optional(),
});

export const revokeBadgeSchema = z.object({
  badgeId: z.string().min(1).max(64),
  reason: reason(3, 300),
});

export const grantRewardSchema = z.object({
  rewardId: z.string().min(1).max(64),
  note: z.string().trim().max(300).optional(),
});

export const profilePatchSchema = z
  .object({
    name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(60).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    businessName: z.string().trim().max(100).nullable().optional(),
    businessDesc: z.string().trim().max(500).nullable().optional(),
    businessCategory: z.string().trim().max(50).nullable().optional(),
    address: z.string().trim().max(200).nullable().optional(),
    latitude: z.number().min(-90, 'Enlem −90 ile 90 arasında olmalı').max(90, 'Enlem −90 ile 90 arasında olmalı').nullable().optional(),
    longitude: z.number().min(-180, 'Boylam −180 ile 180 arasında olmalı').max(180, 'Boylam −180 ile 180 arasında olmalı').nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Değişiklik yok' });
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(60, 'Ad en fazla 60 karakter olabilir'),
    email: z.string().trim().toLowerCase().email('Geçerli bir e-posta adresi girin').max(320),
    role: z.enum(ASSIGNABLE_ROLES).default('CUSTOMER'),
    businessName: z.string().trim().max(100).optional(),
    mode: z.enum(['invite', 'password']).default('invite'),
    password: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'password' && (!v.password || v.password.length < 10)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Şifre en az 10 karakter olmalı' });
    }
    if (v.role === 'DEALER' && !v.businessName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessName'], message: 'Bayi için işletme adı gerekli' });
    }
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const anonymizeSchema = z.object({
  /** Kullanıcının e-postası yazılarak onaylanır. */
  confirmPhrase: z.string().trim().min(3).max(320),
});

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(5).max(100).default(20),
});

export const idParamsSchema = z.object({ id: z.string().min(1).max(64) });

// ───────────────────────────── Saf yardımcılar ─────────────────────────────

/** Hesabın yaşam döngüsü durumu. */
export function deriveStatus(u: { suspendedAt: Date | string | null; anonymizedAt: Date | string | null }): UserStatus {
  if (u.anonymizedAt) return 'anonymized';
  if (u.suspendedAt) return 'suspended';
  return 'active';
}

/**
 * OWASP CSV enjeksiyonu: `= + - @ \t \r` ile başlayan hücre Excel'de formül olarak çalışır.
 * Başına `'` eklenir; tırnak/virgül/satır sonu içeren hücre çift tırnağa alınır.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(values: readonly unknown[]): string {
  return values.map(csvCell).join(',');
}

/** Liste sorgusunu URL dizgisine çevirir (BFF ve CSV bağlantısı aynı anahtarları kullanır). */
export function listQueryString(p: Partial<Record<keyof ListQuery, string | number | undefined | null>>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}
