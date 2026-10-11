/**
 * /admin/privacy (KVKK merkezi) — sunucu ↔ istemci sözleşmesi. Saf modül (Prisma'sız).
 *
 * Bölümler: genel bakış (ölçülen uyum kontrolleri), saklama (gerçek imha işleri + bekleyen
 * satır sayısı), rıza (ConsentRecord istatistikleri), 5651 erişim kayıtları (cursor sayfalama,
 * maskeli IP). Talep kuyruğu `/api/admin/privacy-requests` uçlarını kullanır.
 */
import { z } from 'zod';

export const PRIVACY_TABS = ['genel', 'talepler', 'envanter', 'saklama', 'riza', 'kayitlar'] as const;
export type PrivacyTab = (typeof PRIVACY_TABS)[number];

export function isPrivacyTab(v: unknown): v is PrivacyTab {
  return typeof v === 'string' && (PRIVACY_TABS as readonly string[]).includes(v);
}

// ───────────────────────────── Uyum kontrolleri ─────────────────────────────

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'unknown';

export interface ComplianceCheck {
  id: string;
  title: string;
  status: CheckStatus;
  /** Ölçülen değer ve neden bu durumda olduğu (tek cümle). */
  detail: string;
  /** Düzeltmenin yapılacağı yer (sekme ya da sayfa). */
  href?: string;
}

export interface DsrSummary {
  open: number;
  overdue: number;
  dueSoon: number;
  completed30: number;
  /** En yakın son tarihe kalan gün (açık talep yoksa null; negatif = gecikmiş). */
  nearestDueDays: number | null;
}

export interface LogCoverage {
  /** Son 7 gün, yönetici/kullanıcı aktörlü denetim kayıtları (sistem olayları hariç). */
  windowDays: number;
  total: number;
  withIpPercent: number | null;
  withUaPercent: number | null;
  /** IP'siz yazan ilk 5 işlem (neyin düzeltileceği). */
  missingIpTop: Array<{ action: string; count: number }>;
}

export interface PrivacyOverview {
  generatedAt: string;
  dsr: DsrSummary;
  logCoverage: LogCoverage;
  suspicious: { unresolved: number; unresolvedHigh: number };
  consent: { last30: number; currentVersion: number; currentVersionShare: number | null };
  retention: { lastOkAt: string | null; lastStatus: string | null; consecutiveFailures: number };
  checks: ComplianceCheck[];
}

// ───────────────────────────── Saklama ─────────────────────────────

export interface RetentionRuleView {
  key: string;
  model: string;
  relation: string;
  days: number;
  field: string;
  /** Süresi dolmuş, bir sonraki günlük temizlikte silinecek satır (null = sayılamadı). */
  pending: number | null;
  legalBasis: string;
}

export interface RetentionPolicyView {
  key: string;
  model: string;
  days: number;
  legalBasis: string;
  note: string | null;
}

export interface CronJobView {
  name: string;
  label: string;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface RetentionView {
  generatedAt: string;
  rules: RetentionRuleView[];
  policies: RetentionPolicyView[];
  analytics: { days: number; pending: number | null };
  jobs: CronJobView[];
  errors: string[];
}

// ───────────────────────────── Rıza ─────────────────────────────

export const CONSENT_WINDOWS = [7, 30, 90] as const;
export type ConsentWindow = (typeof CONSENT_WINDOWS)[number];

export interface ConsentStats {
  generatedAt: string;
  windowDays: number;
  currentVersion: number;
  /** Penceredeki karar (kayıt) sayısı — her karar ayrı satırdır. */
  decisions: number;
  /** Penceredeki farklı kişi/cihaz (userId ya da anonId). */
  subjects: number;
  signedIn: number;
  /** Kategori başına "evet" oranı (kararlar içinde, %). Karar yoksa null. */
  rates: { analytics: number | null; replay: number | null; marketing: number | null };
  /** Yalnız zorunluya izin veren karar oranı. */
  rejectAllRate: number | null;
  byVersion: Array<{ version: string; count: number; current: boolean }>;
  bySource: Array<{ source: string; count: number }>;
  /** İstanbul günlerine göre karar sayısı (eski → yeni, boş günler 0). */
  daily: Array<{ day: string; count: number }>;
}

// ───────────────────────────── 5651 kayıtları ─────────────────────────────

export const LOG_SOURCES = ['all', 'audit', 'card', 'suspicious', 'runtime'] as const;
export type LogSourceFilter = (typeof LOG_SOURCES)[number];
export type LogSource = 'AUDIT' | 'CARD_AUDIT' | 'SUSPICIOUS' | 'RUNTIME_GUARD';

export const LOG_SOURCE_LABELS: Readonly<Record<LogSource, string>> = {
  AUDIT: 'Denetim',
  CARD_AUDIT: 'Kart denetimi',
  SUSPICIOUS: 'Şüpheli olay',
  RUNTIME_GUARD: 'Erişim engeli',
};

/** Kaynak başına saklama notu (ekranda rozet). */
export const LOG_SOURCE_RETENTION: Readonly<Record<LogSource, string | null>> = {
  AUDIT: null,
  CARD_AUDIT: null,
  SUSPICIOUS: null,
  RUNTIME_GUARD: '90 gün saklanır',
};

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const logsQuerySchema = z.object({
  source: z.enum(LOG_SOURCES).default('all'),
  q: z.string().trim().max(120).optional(),
  user: z.string().trim().max(200).optional(),
  from: isoDay,
  to: isoDay,
  cursor: z.string().max(200).optional(),
  size: z.coerce.number().int().min(10).max(100).default(30),
});
export type LogsQuery = z.infer<typeof logsQuerySchema>;

export interface UnifiedLogRow {
  id: string;
  source: LogSource;
  action: string;
  entity: string;
  entityId: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  /** Her zaman maskeli. Maskesiz görüntüleme bu yüzeyde yok (veri minimizasyonu). */
  ip: string | null;
  userAgent: string | null;
  severity: string | null;
  reason: string | null;
}

export interface LogsPage {
  items: UnifiedLogRow[];
  nextCursor: string | null;
}

// ───────────────────────────── Manuel talep ─────────────────────────────

export const manualDsrSchema = z.object({
  type: z.enum(['access', 'deletion', 'rectification', 'objection']),
  email: z.string().trim().toLowerCase().email().max(200),
  channel: z.enum(['email', 'phone', 'mail', 'in_person', 'other']),
  /** Başvurunun asıl alındığı gün (yasal süre buradan başlar). */
  receivedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  message: z.string().trim().max(4000).optional(),
});
export type ManualDsrInput = z.infer<typeof manualDsrSchema>;

export const DSR_CHANNEL_LABELS: Readonly<Record<ManualDsrInput['channel'], string>> = {
  email: 'E-posta',
  phone: 'Telefon',
  mail: 'Posta / noter',
  in_person: 'Elden',
  other: 'Diğer',
};
