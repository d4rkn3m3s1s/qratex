/**
 * Otomasyon yüzeyi (Otomatik yanıt · Telafi · Uyarılar) — BFF ↔ istemci sözleşmeleri.
 * Saf tipler; istemci paketine güvenle girer.
 */
import type { ReplyAction, ReplyCondition } from './reply-rules';
import type { RemedyAutomationConfig } from './remedy-config';
import type { RadarLevel, RadarRuleEval, RadarRules } from '@/lib/dealer-queues/radar-rules';

/* ───────────── Otomatik yanıt ───────────── */

export interface ReplyRuleDto {
  id: string;
  name: string;
  isActive: boolean;
  /** Değerlendirme sırası (0 = ilk). */
  order: number;
  /** Doğrulanmış koşul; `null` → kayıtlı koşul motorca eşleştirilemez (tetiklenemez). */
  condition: ReplyCondition | null;
  sentence: string;
  action: ReplyAction;
  template: string;
  tone: string | null;
  toneName: string | null;
  /** Seçili üslup artık tanımlı değil (yönetici kaldırmış) → sabit metin gider. */
  toneMissing: boolean;
  updatedAt: string;
  stats: { count30: number; lastAt: string | null; ai30: number };
}

export interface RepliesOverviewDto {
  rules: ReplyRuleDto[];
  limit: number;
  tones: Array<{ slug: string; name: string }>;
  summary: { replies7: number; incidents7: number; fired30: number; brokenCount: number; activeCount: number };
  /** Bayi AI ayarı: `null` → okunamadı (uyarı gösterilmez, tahmin yapılmaz). */
  ai: { canUseAi: boolean | null; canAnalyze: boolean | null };
  /** Geçmiş kaydının başladığı an bilinmiyor; sayaçlar son 30 günlük kayıttan gelir. */
  windowDays: number;
}

export interface ReplyPreviewSample {
  id: string;
  rating: number | null;
  sentiment: string | null;
  textPreview: string | null;
  createdAt: string;
  keywordHits: string[];
  replied: boolean;
  href: string;
}

export interface ReplyPreviewDto {
  windowDays: number;
  scanned: number;
  /** Tarama tavanına ulaşıldı (son N kayıt). */
  capped: boolean;
  matched: number;
  /** Eşleşen ama zaten yanıtlanmış (motor dokunmaz). */
  alreadyReplied: number;
  /** Eşleşen ama uygunsuz / güven işaretli (yanıt yazılmaz). */
  unsafe: number;
  samples: ReplyPreviewSample[];
}

export interface ReplyRunDto {
  at: string;
  action: ReplyAction;
  ai: boolean;
  feedback: { id: string; rating: number | null; textPreview: string | null; href: string } | null;
}

/* ───────────── Telafi ───────────── */

export interface RemedyOptionDto {
  type: string;
  label: string;
  unit: string;
  values: number[];
}

export interface RemedyTemplateDto {
  id: string;
  locationId: string | null;
  type: string;
  label: string;
  unit: string;
  values: number[];
  isActive: boolean;
  order: number;
}

export interface RemedyScopeDto {
  /** `null` → işletme geneli. */
  locationId: string | null;
  name: string;
  isActive: boolean;
  /** Şubeye bağlı QR sayısı (işletme geneli için tüm QR'lar). */
  qrCount: number;
  templates: RemedyTemplateDto[];
  /** Bu kapsamda müşterinin göreceği set + kaynağı (çözücüyle aynı kural). */
  effective: { source: 'location' | 'dealer' | 'system'; options: RemedyOptionDto[] };
  /** Aynı türden birden fazla şablon (yalnız ilki kullanılır). */
  duplicateIds: string[];
}

export interface RemedyCatalogDto {
  scopes: RemedyScopeDto[];
  limits: Record<string, { min: number; max: number; integer: boolean }>;
  defaults: RemedyOptionDto[];
  maxValues: number;
}

export interface RemedyStatsDto {
  monthUsed: number;
  cap: number;
  awaiting: number;
  month: { queued: number; awaiting: number; published: number; accepted: number; rejected: number };
  /** Yayınlanan otomatik taslaklarda müşteri kabul oranı (0–1); yayın yoksa null. */
  acceptRate: number | null;
  lastAutoAt: string | null;
  lastScan: { at: string; queued: number; skipped: number } | null;
}

export interface RemedyOverviewDto {
  config: RemedyAutomationConfig;
  stats: RemedyStatsDto;
  catalog: RemedyCatalogDto;
  /** Churn tetiği AI analizi ister; `null` → okunamadı. */
  aiAnalyze: boolean | null;
}

export interface RemedyScanResultDto {
  dryRun: boolean;
  windowDays: number;
  found: number;
  eligible: number;
  anonymous: number;
  alreadyOffered: number;
  cooldown: number;
  capRemaining: number;
  perRun: number;
  /** Kuru çalıştırmada: eklenecek tahmini sayı; gerçek taramada: eklenen. */
  queued: number;
  skipped: Record<string, number>;
  offerIds: string[];
}

/* ───────────── Uyarılar ───────────── */

export interface AlertsStatusDto {
  level: RadarLevel;
  rules: RadarRuleEval[];
  evaluatedAt: string;
}

export interface AlertsOverviewDto {
  rules: RadarRules;
  defaults: RadarRules;
  status: AlertsStatusDto | null;
  lastScanAt: string | null;
  recent: Array<{ id: string; title: string; type: string; severity: string; status: string; createdAt: string; href: string }>;
  replyIncidentRules: number;
  updatedAt: string | null;
}

export const AUTOMATION_KEYS = {
  replies: ['dealer-automation', 'replies'] as const,
  replyRuns: (id: string) => ['dealer-automation', 'replies', 'runs', id] as const,
  replyPreview: (c: unknown) => ['dealer-automation', 'replies', 'preview', c] as const,
  remedy: ['dealer-automation', 'remedy'] as const,
  alerts: ['dealer-automation', 'alerts'] as const,
  alertsPreview: (r: unknown) => ['dealer-automation', 'alerts', 'preview', r] as const,
};
