/**
 * Entegrasyon Merkezi (/admin/integrations) — istemci ile sunucu arasında paylaşılan sözleşme.
 *
 * Tek kaynak: API kapsam kataloğu, webhook olay kataloğu, partner türleri, zod gövde
 * şemaları ve DTO tipleri. Sunucu (BFF uçları, partner API doğrulaması, dispatcher) ve
 * istemci (formlar, rozetler) aynı listeyi okur → "UI'da var, kodda yok" sapması olmaz.
 *
 * Bu dosya istemci tarafından da import edilir: prisma / node modülü import ETMEYİN.
 */
import { z } from 'zod';

// ───────────────────────────── API kapsamları ─────────────────────────────

/** Partner API'sinin GERÇEKTEN denetlediği kapsamlar. Yeni korumalı uç = buraya yeni satır. */
export const API_SCOPES = [
  {
    key: 'read:partner_digest',
    label: 'Bayi 24 saat özeti',
    description: 'GET /api/partner/v1/digest — son 24 saatte bayi bazında NPS, geri bildirim sayısı ve ortalama puan.',
  },
] as const;

export type ApiScopeKey = (typeof API_SCOPES)[number]['key'];
export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key) as [ApiScopeKey, ...ApiScopeKey[]];
/** Joker kapsam: gelecekte eklenecek uçlar dahil her şey. Ayrı onay ister. */
export const FULL_ACCESS_SCOPE = '*';

export function scopeLabel(key: string): string {
  if (key === FULL_ACCESS_SCOPE) return 'Tam erişim (*)';
  return API_SCOPES.find((s) => s.key === key)?.label ?? key;
}

// ───────────────────────────── Webhook olayları ─────────────────────────────

/**
 * Yalnız kod tabanında GERÇEKTEN tetiklenen olaylar. Bir olay ancak tetikleyicisi
 * (dispatchWebhookEvent çağrısı) yazıldığında buraya eklenir — "yakında" olay yok.
 *  - feedback.created → lib/feedback-funnel/on-feedback-created.ts (after())
 *  - incident.created → lib/dealer-queues/radar.ts (runAfter)
 */
export const WEBHOOK_EVENTS = [
  {
    key: 'feedback.created',
    label: 'Yeni geri bildirim',
    description: 'Bir müşteri QR üzerinden geri bildirim gönderdiğinde.',
    sample: { feedbackId: 'fb_123', dealerId: 'dl_456', rating: 4, hasText: true, createdAt: '2026-10-11T09:30:00.000Z' },
  },
  {
    key: 'incident.created',
    label: 'Kriz radarı olayı',
    description: 'Kriz radarı bir bayi için eşik aşımı (puan düşüşü, olumsuz artış vb.) olayı açtığında.',
    sample: { incidentId: 'inc_123', dealerId: 'dl_456', type: 'rating_drop', severity: 'high', source: 'radar' },
  },
] as const;

export type WebhookEventKey = (typeof WEBHOOK_EVENTS)[number]['key'];
export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENTS.map((e) => e.key) as [WebhookEventKey, ...WebhookEventKey[]];
/** Yalnız "Test gönder" ile tek bir uca gönderilen olay; abonelik listesinde yer almaz. */
export const WEBHOOK_TEST_EVENT = 'webhook.test';

export function isLiveWebhookEvent(key: string): key is WebhookEventKey {
  return (WEBHOOK_EVENT_KEYS as readonly string[]).includes(key);
}

export function webhookEventLabel(key: string): string {
  if (key === WEBHOOK_TEST_EVENT) return 'Test olayı';
  return WEBHOOK_EVENTS.find((e) => e.key === key)?.label ?? key;
}

// ───────────────────────────── Partner türleri ─────────────────────────────

export const PARTNER_TYPES = [
  { value: 'POS', label: 'POS / Kasa' },
  { value: 'ajans', label: 'Ajans' },
  { value: 'dijital_menu', label: 'Dijital menü' },
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number]['value'];
export const PARTNER_TYPE_VALUES = PARTNER_TYPES.map((t) => t.value) as [PartnerType, ...PartnerType[]];
export const partnerTypeLabel = (v: string) => PARTNER_TYPES.find((t) => t.value === v)?.label ?? v;

// ───────────────────────────── Ortak doğrulayıcılar ─────────────────────────────

const id = z.string().trim().min(1).max(64);
const nullableId = id.nullable().optional();

/** IPv4, IPv4/CIDR veya IPv6 (tam adres). */
const IP_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?:\/(?:3[0-2]|[12]?\d))?|[0-9a-fA-F:]{2,39})$/;
export const IpAllowlist = z
  .array(z.string().trim().regex(IP_RE, 'Geçerli bir IPv4, IPv4/CIDR ya da IPv6 adresi girin.'))
  .max(20, 'En fazla 20 IP girilebilir.');

export const WebhookUrl = z
  .string()
  .trim()
  .min(1, 'URL gerekli.')
  .max(2000, 'URL çok uzun.')
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === 'https:' || p.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Geçerli bir https:// adresi girin.');

const Scopes = z
  .array(z.union([z.enum(API_SCOPE_KEYS), z.literal(FULL_ACCESS_SCOPE)]))
  .min(1, 'En az bir kapsam seçin.')
  .max(20);

// ───────────────────────────── API anahtarı gövdeleri ─────────────────────────────

export const EXPIRY_CHOICES = [30, 90, 365] as const;

export const CreateKeyBody = z
  .object({
    name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı.').max(100),
    scopes: Scopes,
    /** Tam erişim (*) yalnız açık onayla. */
    confirmFullAccess: z.boolean().optional(),
    dealerId: nullableId,
    partnerId: nullableId,
    /** null = süresiz (uyarıyla). */
    expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable(),
    ipAllowlist: IpAllowlist.optional(),
  })
  .refine((b) => !b.scopes.includes(FULL_ACCESS_SCOPE) || b.confirmFullAccess === true, {
    message: 'Tam erişim kapsamı için ayrıca onay verin.',
    path: ['confirmFullAccess'],
  });
export type CreateKeyInput = z.infer<typeof CreateKeyBody>;

export const UpdateKeyBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    scopes: Scopes.optional(),
    confirmFullAccess: z.boolean().optional(),
    dealerId: nullableId,
    partnerId: nullableId,
    ipAllowlist: IpAllowlist.optional(),
    /** ISO tarih ya da null (süresiz). */
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((b) => !b.scopes?.includes(FULL_ACCESS_SCOPE) || b.confirmFullAccess === true, {
    message: 'Tam erişim kapsamı için ayrıca onay verin.',
    path: ['confirmFullAccess'],
  });
export type UpdateKeyInput = z.infer<typeof UpdateKeyBody>;

export const RevokeKeyBody = z.object({ reason: z.string().trim().min(3, 'Kısa bir gerekçe yazın.').max(300) });
export const RollKeyBody = z.object({
  /** Eski anahtarın geçerli kalacağı süre (saat). 0 = hemen geçersiz. */
  graceHours: z.union([z.literal(0), z.literal(1), z.literal(24), z.literal(72)]),
});

export const KEY_STATUSES = ['active', 'expired', 'revoked', 'all'] as const;
export type KeyStatusFilter = (typeof KEY_STATUSES)[number];
export const KeyListQuery = z.object({
  status: z.enum(KEY_STATUSES).catch('active').default('active'),
  q: z.string().trim().max(100).optional(),
  partnerId: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
  size: z.coerce.number().int().min(5).max(100).catch(25).default(25),
});
export type KeyListParams = z.infer<typeof KeyListQuery>;

// ───────────────────────────── Webhook gövdeleri ─────────────────────────────

export const CreateWebhookBody = z.object({
  url: WebhookUrl,
  events: z.array(z.enum(WEBHOOK_EVENT_KEYS)).min(1, 'En az bir olay seçin.'),
  description: z.string().trim().max(200).optional(),
  partnerId: nullableId,
});
export type CreateWebhookInput = z.infer<typeof CreateWebhookBody>;

export const UpdateWebhookBody = z.object({
  url: WebhookUrl.optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_KEYS)).min(1, 'En az bir olay seçin.').optional(),
  description: z.string().trim().max(200).nullable().optional(),
  partnerId: nullableId,
  isActive: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookBody>;

export const TestWebhookBody = z.object({ event: z.enum(WEBHOOK_EVENT_KEYS).optional() });

export const WEBHOOK_STATUSES = ['active', 'paused', 'archived', 'all'] as const;
export const WebhookListQuery = z.object({
  status: z.enum(WEBHOOK_STATUSES).catch('active').default('active'),
  q: z.string().trim().max(200).optional(),
  partnerId: z.string().trim().max(64).optional(),
});
export type WebhookListParams = z.infer<typeof WebhookListQuery>;

export const DeliveryListQuery = z.object({
  status: z.enum(['all', 'ok', 'failed']).catch('all').default('all'),
  cursor: z.string().trim().max(64).optional(),
  size: z.coerce.number().int().min(5).max(50).catch(20).default(20),
});

// ───────────────────────────── Partner gövdeleri ─────────────────────────────

const PartnerContact = z.object({
  contactName: z.string().trim().max(100).optional(),
  contactEmail: z.union([z.string().trim().email('Geçerli bir e-posta girin.').max(200), z.literal('')]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const CreatePartnerBody = PartnerContact.extend({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalı.').max(100),
  type: z.enum(PARTNER_TYPE_VALUES),
  dealerIds: z.array(id).max(200).optional(),
});
export type CreatePartnerInput = z.infer<typeof CreatePartnerBody>;

export const UpdatePartnerBody = PartnerContact.extend({
  name: z.string().trim().min(2).max(100).optional(),
  type: z.enum(PARTNER_TYPE_VALUES).optional(),
  dealerIds: z.array(id).max(200).optional(),
  /** false → pasifleştir (anahtarları reddedilir, webhook'ları durur). */
  isActive: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** Eski serbest metin webhookUrl'yi gerçek bir webhook aboneliğine dönüştür. */
  migrateLegacyWebhook: z.object({ events: z.array(z.enum(WEBHOOK_EVENT_KEYS)).min(1) }).optional(),
  /** Hiçbir yerde doğrulanmayan eski qrk_ anahtar özetini temizle. */
  clearLegacyKey: z.literal(true).optional(),
});
export type UpdatePartnerInput = z.infer<typeof UpdatePartnerBody>;

export const PartnerListQuery = z.object({
  status: z.enum(['active', 'inactive', 'archived', 'all']).catch('active').default('active'),
  type: z.enum(PARTNER_TYPE_VALUES).optional().catch(undefined),
  q: z.string().trim().max(100).optional(),
});
export type PartnerListParams = z.infer<typeof PartnerListQuery>;

export const DealerSearchQuery = z.object({ q: z.string().trim().max(100).default(''), ids: z.string().max(2000).optional() });

// ───────────────────────────── DTO'lar ─────────────────────────────

export type KeyStatus = 'active' | 'expired' | 'revoked';
export type Ref = { id: string; label: string } | null;

export type ApiKeyItem = {
  id: string;
  name: string;
  /** qrx_ab12…wxyz (sonek yalnız yeni anahtarlarda). */
  display: string;
  scopes: string[];
  /** Kapsamsız eski anahtar: hiçbir korumalı uçta çalışmaz. */
  scopeless: boolean;
  status: KeyStatus;
  dealer: Ref;
  partner: Ref;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  ipAllowlist: string[];
  rolledToId: string | null;
};

export type Paged<T> = { items: T[]; total: number; page: number; size: number };

export type ApiKeyCreated = { key: ApiKeyItem; rawKey: string };

export type UsageDay = { day: string; ok: number; denied: number };
export type AuditEntry = { id: string; action: string; label: string; at: string; actor: string | null; detail: string | null };

export type ApiKeyDetail = {
  key: ApiKeyItem;
  /** null → kullanım sayacı (Redis) yapılandırılmamış. */
  usage: UsageDay[] | null;
  audit: AuditEntry[];
};

export type WebhookHealth = { total: number; ok: number; failed: number; lastAt: string | null; lastStatus: number | null; lastError: string | null };

export type WebhookItem = {
  id: string;
  url: string;
  host: string;
  events: string[];
  /** Kataloğun dışında kalan (hiç tetiklenmeyen) eski olay abonelikleri. */
  deadEvents: string[];
  description: string | null;
  status: 'active' | 'paused' | 'archived';
  disabledReason: string | null;
  hasSecret: boolean;
  secretHint: string | null;
  partner: Ref;
  createdAt: string;
  createdBy: string | null;
  health24h: WebhookHealth;
  health7d: WebhookHealth;
};

export type WebhookCreated = { webhook: WebhookItem; secret: string };

export type DeliveryItem = {
  id: string;
  webhookId: string;
  event: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  errorKind: string | null;
  durationMs: number | null;
  attempts: number | null;
  test: boolean;
  resendOf: string | null;
  hasBody: boolean;
  body: string | null;
  responseSnippet: string | null;
  at: string;
};

export type DeliveryPage = { items: DeliveryItem[]; nextCursor: string | null };

export type WebhookDetail = { webhook: WebhookItem; audit: AuditEntry[] };

export type DeliveryResult = {
  ok: boolean;
  status: number | null;
  durationMs: number;
  error: string | null;
  errorKind: string | null;
  responseSnippet: string | null;
  deliveryId: string;
};

export type PartnerItem = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  status: 'active' | 'inactive' | 'archived';
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  dealerIds: string[];
  activeKeys: number;
  lastKeyUseAt: string | null;
  webhooks: number;
  webhookHealth24h: WebhookHealth;
  legacyWebhookUrl: string | null;
  hasLegacyKey: boolean;
  createdAt: string;
};

export type PartnerDetail = {
  partner: PartnerItem;
  dealers: { id: string; label: string }[];
  keys: ApiKeyItem[];
  webhooks: WebhookItem[];
  audit: AuditEntry[];
};

export type IntegrationsOverview = {
  generatedAt: string;
  externalApi: { enabled: boolean; digestEnabled: boolean };
  keys: { active: number; used7d: number; idle90d: number; expiring30d: number; scopeless: number };
  webhooks: { active: number; paused: number; deliveries24h: number; failed24h: number; successRate24h: number | null; series7d: number[] };
  partners: { active: number; inactive: number };
};

export type DealerOption = { id: string; label: string };
