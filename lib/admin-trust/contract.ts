/**
 * Güven Merkezi (/admin/trust) — istemci ve sunucunun paylaştığı sözleşme.
 * Saf modül: Prisma/Next içermez (istemci paketine girebilir).
 */
import { z } from 'zod';

// ───────────────────────────── Sözlükler ─────────────────────────────

/** SuspiciousActivity.severity için TEK sözlük (büyük harf). Eski küçük harf veriler normalize edilir. */
export const CASE_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];

export const SEVERITY_LABEL: Record<CaseSeverity, string> = {
  CRITICAL: 'Kritik',
  HIGH: 'Yüksek',
  MEDIUM: 'Orta',
  LOW: 'Düşük',
};

/** Ham önem değerini tek sözlüğe çevirir (SecurityAlert'in WARNING/ERROR/INFO değerleri dahil). */
export function normalizeSeverity(raw: string | null | undefined): CaseSeverity {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === 'CRITICAL') return 'CRITICAL';
  if (v === 'HIGH' || v === 'ERROR') return 'HIGH';
  if (v === 'MEDIUM' || v === 'WARNING') return 'MEDIUM';
  return 'LOW';
}

/** Bilinen vaka türleri. Bilinmeyen tür ham adıyla değil "Diğer sinyal" olarak gösterilir. */
export const CASE_TYPE_LABEL: Record<string, string> = {
  POINTS_VELOCITY: 'Puan hızı anomalisi',
  RAPID_CONSUMPTION: 'Hızlı tüketim',
  SHARED_IP: 'Çoklu hesap (ortak IP)',
  BRUTE_FORCE: 'Kaba kuvvet girişi',
  RAPID_SCAN: 'Hızlı tarama',
  FRAUD_VELOCITY: 'Tarama hızı',
  DUPLICATE_ENTRY: 'Mükerrer kayıt',
  UNUSUAL_AMOUNT: 'Olağandışı tutar',
  IP_MISMATCH: 'IP uyuşmazlığı',
};

export function caseTypeLabel(type: string | null | undefined): string {
  const key = String(type ?? '').trim().toUpperCase();
  return CASE_TYPE_LABEL[key] ?? 'Diğer sinyal';
}

/** Çözüm kodları — `SuspiciousActivity.resolution` alanına `KOD: not` olarak yazılır. */
export const RESOLUTION_CODES = ['false_positive', 'confirmed', 'action_taken'] as const;
export type ResolutionCode = (typeof RESOLUTION_CODES)[number];
export const RESOLUTION_LABEL: Record<ResolutionCode, string> = {
  false_positive: 'Yanlış alarm',
  confirmed: 'Doğrulandı (sahtekârlık)',
  action_taken: 'Aksiyon alındı',
};

export function encodeResolution(code: ResolutionCode, note: string): string {
  return `${code}: ${note.trim()}`.slice(0, 1000);
}

export function parseResolution(raw: string | null | undefined): { code: ResolutionCode | null; note: string } {
  const s = String(raw ?? '');
  const m = /^(false_positive|confirmed|action_taken):\s?([\s\S]*)$/.exec(s);
  if (!m) return { code: null, note: s };
  return { code: m[1] as ResolutionCode, note: m[2] };
}

export const FRAUD_STATUSES = ['clean', 'flagged', 'shadow_ban'] as const;
export type FraudStatus = (typeof FRAUD_STATUSES)[number];
export const FRAUD_STATUS_LABEL: Record<FraudStatus, string> = {
  clean: 'Temiz',
  flagged: 'İşaretli',
  shadow_ban: 'Gölge yasak',
};
export function normalizeFraudStatus(raw: string | null | undefined): FraudStatus {
  return (FRAUD_STATUSES as readonly string[]).includes(String(raw)) ? (raw as FraudStatus) : 'clean';
}

/** Güven bağlamında "hassas" sayılan denetim eylemleri (gürültüyü — rozet, profil — dışlar). */
export const SENSITIVE_AUDIT_ACTIONS = [
  'USER_SUSPEND',
  'USER_UNSUSPEND',
  'USER_SESSIONS_REVOKE',
  'USER_ROLE_CHANGE',
  'ROLE_CHANGE',
  'ROLE_ELEVATION_REQUESTED',
  'ROLE_ELEVATION_APPROVED',
  'ROLE_ELEVATION_REJECTED',
  'ADMIN_POINTS_ADJUST',
  'gdpr_anonymize',
  'TRUST_CASE_RESOLVE',
  'TRUST_CASE_REOPEN',
  'TRUST_CASE_BULK_RESOLVE',
  'TRUST_FRAUD_STATUS',
  'TRUST_LEDGER_REVERSE',
  'TRUST_RULES_UPDATE',
  'TRUST_SCAN',
  'TRUST_ALERTS_UPDATE',
  'TRUST_CASES_EXPORT',
] as const;

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  USER_SUSPEND: 'Hesap askıya alındı',
  USER_UNSUSPEND: 'Askı kaldırıldı',
  USER_SESSIONS_REVOKE: 'Oturumlar kapatıldı',
  USER_ROLE_CHANGE: 'Rol değişti',
  ROLE_CHANGE: 'Rol değişti',
  ROLE_ELEVATION_REQUESTED: 'Yönetici yetkisi istendi',
  ROLE_ELEVATION_APPROVED: 'Yönetici yetkisi onaylandı',
  ROLE_ELEVATION_REJECTED: 'Yönetici yetkisi reddedildi',
  ADMIN_POINTS_ADJUST: 'Puan düzeltmesi',
  gdpr_anonymize: 'Hesap anonimleştirildi',
  TRUST_CASE_RESOLVE: 'Vaka çözüldü',
  TRUST_CASE_REOPEN: 'Vaka yeniden açıldı',
  TRUST_CASE_BULK_RESOLVE: 'Vakalar toplu çözüldü',
  TRUST_FRAUD_STATUS: 'Sahtekârlık durumu değişti',
  TRUST_LEDGER_REVERSE: 'Puan geri alındı',
  TRUST_RULES_UPDATE: 'Tespit kuralları güncellendi',
  TRUST_SCAN: 'Sinyal taraması çalıştı',
  TRUST_ALERTS_UPDATE: 'Güvenlik uyarıları güncellendi',
  TRUST_CASES_EXPORT: 'Vakalar dışa aktarıldı (CSV)',
};

// ───────────────────────────── Kurallar ─────────────────────────────

export const RuleSeverity = z.enum(CASE_SEVERITIES);

export const TrustRulesSchema = z.object({
  velocity: z.object({
    enabled: z.boolean(),
    /** Pencerede `points_credited` toplamı bu değere ulaşırsa vaka. */
    points: z.number().int().min(50).max(1_000_000),
    windowHours: z.number().int().min(1).max(168),
    severity: RuleSeverity,
  }),
  rapidConsumption: z.object({
    enabled: z.boolean(),
    /** Pencerede bu kadar tüketim (kart okutma) → vaka. */
    count: z.number().int().min(2).max(500),
    windowMinutes: z.number().int().min(1).max(1440),
    severity: RuleSeverity,
  }),
  sharedIp: z.object({
    enabled: z.boolean(),
    /** Aynı IP'den bu kadar farklı müşteri hesabı → vaka. */
    accounts: z.number().int().min(2).max(100),
    windowDays: z.number().int().min(1).max(90),
    severity: RuleSeverity,
  }),
});
export type TrustRules = z.infer<typeof TrustRulesSchema>;

/** Sunucu varsayılanı (ayar yoksa). Eşikler mevcut kodla uyumlu: points-velocity 500/24s, fraud engine 10 tarama/saat. */
export const DEFAULT_TRUST_RULES: TrustRules = {
  velocity: { enabled: true, points: 500, windowHours: 24, severity: 'HIGH' },
  rapidConsumption: { enabled: true, count: 10, windowMinutes: 60, severity: 'MEDIUM' },
  sharedIp: { enabled: true, accounts: 4, windowDays: 30, severity: 'MEDIUM' },
};

export const RULE_KEYS = ['velocity', 'rapidConsumption', 'sharedIp'] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export const RULE_TYPE: Record<RuleKey, string> = {
  velocity: 'POINTS_VELOCITY',
  rapidConsumption: 'RAPID_CONSUMPTION',
  sharedIp: 'SHARED_IP',
};
export const RULE_LABEL: Record<RuleKey, string> = {
  velocity: 'Puan hızı',
  rapidConsumption: 'Hızlı tüketim',
  sharedIp: 'Çoklu hesap (ortak IP)',
};

export const UpdateRulesBody = z.object({
  rules: TrustRulesSchema,
  /** İyimser kilit: okunan sürüm (ISO zaman ya da null = hiç kaydedilmemiş). */
  baseVersion: z.string().nullable(),
  reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(500),
});

// ───────────────────────────── Sorgular / gövdeler ─────────────────────────────

const csv = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      const raw = (Array.isArray(v) ? v.join(',') : v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      return raw.filter((s): s is T => (values as readonly string[]).includes(s));
    });

export const CaseListQuery = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  severity: csv(CASE_SEVERITIES),
  type: z.string().trim().max(60).optional().transform((v) => (v ? v.toUpperCase() : undefined)),
  window: z.enum(['24h', '7d', '30d', 'all']).default('all'),
  q: z.string().trim().max(120).optional().transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['createdAt.desc', 'createdAt.asc']).default('createdAt.desc'),
});
export type CaseListQueryInput = z.input<typeof CaseListQuery>;
export type CaseListParams = z.output<typeof CaseListQuery>;

export const CaseActionBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resolve'),
    code: z.enum(RESOLUTION_CODES),
    note: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(800),
  }),
  z.object({ action: z.literal('reopen'), note: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(800) }),
]);
export type CaseActionInput = z.infer<typeof CaseActionBody>;

export const BulkResolveBody = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
  code: z.enum(RESOLUTION_CODES),
  note: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(800),
});

export const SubjectActionBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('fraud_status'),
    status: z.enum(FRAUD_STATUSES),
    /** İyimser kilit: ekranda görülen mevcut durum. */
    from: z.enum(FRAUD_STATUSES),
    reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(500),
    caseId: z.string().max(64).optional(),
  }),
  z.object({
    action: z.enum(['suspend', 'unsuspend']),
    reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(500),
    caseId: z.string().max(64).optional(),
  }),
]);
export type SubjectActionInput = z.infer<typeof SubjectActionBody>;

export const ReverseLedgerBody = z.object({
  reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(500),
  caseId: z.string().max(64).optional(),
});

export const AlertListQuery = z.object({
  status: z.enum(['open', 'unread', 'resolved', 'all']).default('open'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(10).max(100).default(20),
});

export const AlertActionBody = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
  action: z.enum(['read', 'resolve', 'reopen']),
});

export const SensitiveAuditQuery = z.object({
  window: z.enum(['24h', '7d', '30d']).default('7d'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(10).max(100).default(20),
});

// ───────────────────────────── Yanıt tipleri ─────────────────────────────

export type Paged<T> = { items: T[]; total: number; page: number; size: number };

export type TrustOverview = {
  generatedAt: string;
  openCases: { total: number; bySeverity: Record<CaseSeverity, number> };
  newCases24h: number;
  /** Son 14 günün (İstanbul günü) yeni vaka sayıları, eskiden yeniye. */
  caseSeries: { day: string; count: number }[];
  alerts: { last24h: number; unread: number; criticalOpen: number };
  accounts: {
    flagged: { customer: number; dealer: number; other: number };
    shadowBan: { customer: number; dealer: number; other: number };
    suspended: number;
  };
  /** Gölge yasaklı hesaplara son 7 günde YAZILMAYAN (void) puan. */
  voidedPoints7d: number;
  /** Güven Merkezi'nden son 30 günde geri alınan puan. */
  reversedPoints30d: number;
  sensitiveActions24h: number;
  lastScan: ScanSummary | null;
  rulesEnabled: number;
};

export type ScanSummary = {
  at: string;
  by: string | null;
  created: number;
  byRule: Record<RuleKey, { candidates: number; created: number; enabled: boolean }>;
};

export type CaseSubject =
  | { kind: 'user'; id: string; name: string | null; email: string | null; role: string; fraudStatus: FraudStatus; suspended: boolean }
  | { kind: 'identifier'; value: string }
  | { kind: 'ip'; value: string }
  | { kind: 'none' };

export type CaseListItem = {
  id: string;
  type: string;
  typeLabel: string;
  severity: CaseSeverity;
  description: string;
  subject: CaseSubject;
  dealer: { id: string; name: string | null } | null;
  ipAddress: string | null;
  isResolved: boolean;
  resolutionCode: ResolutionCode | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type LedgerRow = {
  id: string;
  delta: number;
  source: string;
  status: string;
  reason: string | null;
  createdAt: string;
  /** Güven Merkezi'nden geri alındı mı (ters kayıt defterde var). */
  reversed: boolean;
  reversible: boolean;
};

export type SubjectProfile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  points: number;
  fraudStatus: FraudStatus;
  fraudScore: number | null;
  trustScore: number;
  trustTier: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  anonymized: boolean;
  isDemo: boolean;
  createdAt: string;
  /** Son 24 saatte `points_credited` toplamı. */
  points24h: number;
  consumptions24h: number;
  openCases: number;
};

export type CaseDetail = CaseListItem & {
  metadata: unknown;
  userAgent: string | null;
  cardId: string | null;
  resolution: { code: ResolutionCode | null; note: string; by: { id: string; name: string | null } | null } | null;
  profile: SubjectProfile | null;
  ledger: LedgerRow[];
  related: CaseListItem[];
  /** Aynı IP'den (denetim günlüğü, son 30 gün) görülen diğer hesaplar. */
  sameIpAccounts: { id: string; name: string | null; email: string | null; role: string; fraudStatus: FraudStatus }[];
  history: AuditRow[];
};

export type AlertItem = {
  id: string;
  type: string;
  typeLabel: string;
  message: string;
  severity: CaseSeverity;
  targetId: string | null;
  targetType: string | null;
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
};

export type AuditRow = {
  id: string;
  action: string;
  actionLabel: string;
  entity: string;
  entityId: string | null;
  actor: { id: string | null; name: string | null; email: string | null; role: string | null };
  ipAddress: string | null;
  newData: unknown;
  createdAt: string;
};

export type RulesState = {
  rules: TrustRules;
  version: string | null;
  isDefault: boolean;
  stats: Record<RuleKey, { triggered30d: number; resolved30d: number; falsePositive30d: number; open: number }>;
};

/**
 * URL → vaka listesi sorgu dizesi. Sunucu ön yüklemesi ve istemci AYNI dizeyi üretir
 * (react-query anahtarı eşleşsin). Varsayılan değerler yazılmaz.
 */
export const CASE_QS_KEYS = ['status', 'severity', 'type', 'window', 'q', 'page', 'size', 'sort'] as const;
export function caseQsFromParams(get: (key: string) => string | null): string {
  const sp = new URLSearchParams();
  for (const k of CASE_QS_KEYS) {
    const v = get(k);
    if (v) sp.set(k, v);
  }
  return sp.toString();
}
export const ALERT_QS_KEYS = ['astatus', 'apage', 'asize'] as const;
export function alertQsFromParams(get: (key: string) => string | null): string {
  const sp = new URLSearchParams();
  const s = get('astatus');
  if (s) sp.set('status', s);
  const p = get('apage');
  if (p) sp.set('page', p);
  const z = get('asize');
  if (z) sp.set('size', z);
  return sp.toString();
}
