/**
 * ApiKey / Webhook yaşam döngüsü meta verisi — ŞEMA DEĞİŞTİRMEDEN.
 *
 * Şema dalgası kapandığı için `ApiKey` modelinde revokedAt/expiresAt/dealerId/partnerId
 * ve `Webhook` modelinde description/partnerId/disabledReason kolonları yok. Bunlar mevcut
 * Json kolonlarında sürümlü bir zarf olarak tutulur:
 *   ApiKey.scope    → eski: ["read:partner_digest"]   yeni: { v: 2, scopes: [...], ... }
 *   Webhook.events  → eski: ["feedback.created"]       yeni: { v: 2, events: [...], ... }
 * Okuyucular her iki biçimi de anlar (geriye uyumlu). Saf modül: istemci de kullanabilir.
 */

export type KeyMeta = {
  scopes: string[];
  dealerId: string | null;
  partnerId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedById: string | null;
  revokeReason: string | null;
  /** Ham anahtarın son 4 karakteri (yalnız yeni anahtarlarda). */
  suffix: string | null;
  ipAllowlist: string[];
  rolledFromId: string | null;
  rolledToId: string | null;
};

export const EMPTY_KEY_META: KeyMeta = {
  scopes: [],
  dealerId: null,
  partnerId: null,
  expiresAt: null,
  revokedAt: null,
  revokedById: null,
  revokeReason: null,
  suffix: null,
  ipAllowlist: [],
  rolledFromId: null,
  rolledToId: null,
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isoOrNull = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
};

export function parseKeyMeta(raw: unknown): KeyMeta {
  if (Array.isArray(raw)) return { ...EMPTY_KEY_META, scopes: strArr(raw) };
  if (!raw || typeof raw !== 'object') return { ...EMPTY_KEY_META };
  const o = raw as Record<string, unknown>;
  return {
    scopes: strArr(o.scopes),
    dealerId: str(o.dealerId),
    partnerId: str(o.partnerId),
    expiresAt: isoOrNull(o.expiresAt),
    revokedAt: isoOrNull(o.revokedAt),
    revokedById: str(o.revokedById),
    revokeReason: str(o.revokeReason),
    suffix: str(o.suffix),
    ipAllowlist: strArr(o.ipAllowlist),
    rolledFromId: str(o.rolledFromId),
    rolledToId: str(o.rolledToId),
  };
}

export function serializeKeyMeta(m: KeyMeta): Record<string, unknown> {
  return { v: 2, ...m };
}

export type KeyLifecycle = 'active' | 'expired' | 'revoked';

export function keyLifecycle(m: KeyMeta, now: Date = new Date()): KeyLifecycle {
  if (m.revokedAt) return 'revoked';
  if (m.expiresAt && Date.parse(m.expiresAt) <= now.getTime()) return 'expired';
  return 'active';
}

export function keyDisplay(prefix: string, suffix: string | null): string {
  return suffix ? `${prefix}…${suffix}` : `${prefix}…`;
}

// ───────────────────────────── IP izin listesi ─────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** Tek bir kural (IPv4, IPv4/CIDR ya da tam IPv6) eşleşir mi? */
export function ipMatches(ip: string, rule: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '').trim();
  if (rule.includes('/')) {
    const [base, bitsRaw] = rule.split('/');
    const bits = Number(bitsRaw);
    const a = ipv4ToInt(clean);
    const b = ipv4ToInt(base);
    if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (a & mask) === (b & mask);
  }
  return clean.toLowerCase() === rule.trim().toLowerCase();
}

/** Liste boşsa her IP serbest; doluysa IP bilinmiyorsa REDDET (varsayılan reddet). */
export function ipAllowed(ip: string | null, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  return allowlist.some((r) => ipMatches(ip, r));
}

// ───────────────────────────── Webhook meta ─────────────────────────────

export type WebhookMeta = {
  events: string[];
  description: string | null;
  partnerId: string | null;
  archivedAt: string | null;
  /** 'auto_failures' | 'partner_inactive' | 'manual' */
  disabledReason: string | null;
  secretHint: string | null;
  secretRotatedAt: string | null;
};

export const EMPTY_WEBHOOK_META: WebhookMeta = {
  events: [],
  description: null,
  partnerId: null,
  archivedAt: null,
  disabledReason: null,
  secretHint: null,
  secretRotatedAt: null,
};

export function parseWebhookMeta(raw: unknown): WebhookMeta {
  if (Array.isArray(raw)) return { ...EMPTY_WEBHOOK_META, events: strArr(raw) };
  if (!raw || typeof raw !== 'object') return { ...EMPTY_WEBHOOK_META };
  const o = raw as Record<string, unknown>;
  return {
    events: strArr(o.events),
    description: str(o.description),
    partnerId: str(o.partnerId),
    archivedAt: isoOrNull(o.archivedAt),
    disabledReason: str(o.disabledReason),
    secretHint: str(o.secretHint),
    secretRotatedAt: isoOrNull(o.secretRotatedAt),
  };
}

export function serializeWebhookMeta(m: WebhookMeta): Record<string, unknown> {
  return { v: 2, ...m };
}

export function webhookStatus(isActive: boolean, m: WebhookMeta): 'active' | 'paused' | 'archived' {
  if (m.archivedAt) return 'archived';
  return isActive ? 'active' : 'paused';
}

export const DISABLED_REASON_LABEL: Record<string, string> = {
  auto_failures: 'Art arda başarısız teslim nedeniyle otomatik durduruldu',
  partner_inactive: 'Bağlı partner pasifleştirildiği için durduruldu',
  manual: 'Yönetici tarafından duraklatıldı',
};

// ───────────────────────────── Partner meta (Partner.metadata) ─────────────────────────────

export type PartnerMeta = {
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  dealerIds: string[];
  archivedAt: string | null;
  /** Bilinmeyen eski alanlar korunur. */
  extra: Record<string, unknown>;
};

const PARTNER_KNOWN = new Set(['contactName', 'contactEmail', 'notes', 'dealerIds', 'archivedAt']);

export function parsePartnerMeta(raw: unknown): PartnerMeta {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!PARTNER_KNOWN.has(k)) extra[k] = v;
  return {
    contactName: str(o.contactName),
    contactEmail: str(o.contactEmail),
    notes: str(o.notes),
    dealerIds: strArr(o.dealerIds),
    archivedAt: isoOrNull(o.archivedAt),
    extra,
  };
}

export function serializePartnerMeta(m: PartnerMeta): Record<string, unknown> {
  const { extra, ...rest } = m;
  return { ...extra, ...rest };
}
