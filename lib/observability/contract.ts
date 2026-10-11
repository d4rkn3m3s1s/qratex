/**
 * /admin/observability ve /admin/jobs sözleşmesi — sunucu ve istemci aynı tipleri okur.
 * İstemci güvenli: Prisma/Redis içe aktarmaz.
 */
import { z } from 'zod';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
export type HealthStatus = 'ok' | 'warn' | 'error' | 'unknown';

export const OBS_WINDOWS = ['2h', '24h'] as const;
export type ObsWindow = (typeof OBS_WINDOWS)[number];
export const obsWindowSchema = z.enum(OBS_WINDOWS);
/** Kovalar saatlik: "2 saat" = içinde bulunulan saat + önceki saat. */
export const OBS_WINDOW_LABEL: Record<ObsWindow, string> = { '2h': 'Son 2 saat', '24h': 'Son 24 saat' };
export const OBS_WINDOW_HOURS: Record<ObsWindow, number> = { '2h': 2, '24h': 24 };

/** Bölüm sonucu: biri düşerse yalnız o bölüm hata gösterir ("200 + sıfırlar" yok). */
export type Section<T> =
  | { ok: true; data: T; generatedAt: string }
  | { ok: false; error: string; generatedAt: string };

// ───────────── Sağlık ─────────────

export type HealthCheckView = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  latencyMs?: number | null;
  href: string;
};

export type DeployInfo = {
  vercelEnv: string | null;
  region: string | null;
  commitSha: string | null;
  commitRef: string | null;
};

export type HealthView = {
  overall: HealthStatus;
  checks: HealthCheckView[];
  deploy: DeployInfo;
  webhooks: { deliveries24h: number; failures24h: number; failureRatePct: number | null } | null;
};

// ───────────── Uç metrikleri ─────────────

export type RouteRow = {
  route: string;
  requests: number;
  errors5xx: number;
  errors4xx: number;
  errorRatePct: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p95AtLeast: boolean;
};

export type TrafficView =
  | { collecting: false; reason: string }
  | {
      collecting: true;
      window: ObsWindow;
      totals: { requests: number; errors5xx: number; errors4xx: number; errorRatePct: number | null; p95Ms: number | null; p95AtLeast: boolean };
      /** Saatlik seri (eskiden yeniye); `hourStart` ISO. */
      series: Array<{ hourStart: string; requests: number; errors5xx: number }>;
      topErrors: RouteRow[];
      slowest: RouteRow[];
      routeCount: number;
    };

// ───────────── Web Vitals ─────────────

export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type VitalName = (typeof VITAL_NAMES)[number];

export type VitalSummary = {
  name: VitalName;
  n: number;
  p75: number | null;
  p75AtLeast: boolean;
  good: number;
  needsImprovement: number;
  poor: number;
  rating: 'good' | 'needs-improvement' | 'poor' | null;
};

export type VitalPathRow = { path: string; n: number; p75: number | null; p75AtLeast: boolean; rating: VitalSummary['rating'] };

export type VitalsView =
  | { collecting: false; reason: string }
  | {
      collecting: true;
      windowHours: number;
      metrics: VitalSummary[];
      /** LCP ve INP için en kötü p75 yollar (en az 5 örnek). */
      worstPaths: Record<'LCP' | 'INP', VitalPathRow[]>;
    };

export const VITAL_META: Record<VitalName, { label: string; unit: 'ms' | ''; good: number; poor: number; description: string }> = {
  LCP: { label: 'En büyük içerik boyaması', unit: 'ms', good: 2500, poor: 4000, description: 'Ana içeriğin görünme süresi' },
  INP: { label: 'Etkileşimden sonraki boyama', unit: 'ms', good: 200, poor: 500, description: 'Tıklamaya tepki gecikmesi' },
  CLS: { label: 'Düzen kayması', unit: '', good: 0.1, poor: 0.25, description: 'Beklenmeyen kayma puanı (birimsiz)' },
  FCP: { label: 'İlk içerik boyaması', unit: 'ms', good: 1800, poor: 3000, description: 'İlk metin/görselin çıkışı' },
  TTFB: { label: 'İlk bayta kadar süre', unit: 'ms', good: 800, poor: 1800, description: 'Sunucu yanıt başlangıcı' },
};

// ───────────── Vercel platform ─────────────

export type PlatformTone = 'ok' | 'warn' | 'error' | 'critical' | 'maintenance' | 'unknown';

export type PlatformView = {
  indicator: { tone: PlatformTone; label: string; description: string };
  incidents: Array<{ id: string; name: string; status: string; statusLabel: string; impact: string; impactTone: PlatformTone; updatedAt: string | null; latestUpdate: string | null; shortlink: string | null }>;
  maintenances: Array<{ id: string; name: string; scheduledFor: string | null; shortlink: string | null }>;
  components: Array<{ id: string; name: string; status: string; tone: PlatformTone; label: string }>;
  operationalCount: number;
  fetchedAt: string;
};

const PLATFORM_TONE: Record<string, PlatformTone> = {
  none: 'ok',
  operational: 'ok',
  minor: 'warn',
  degraded_performance: 'warn',
  under_maintenance: 'maintenance',
  maintenance: 'maintenance',
  major: 'error',
  partial_outage: 'error',
  critical: 'critical',
  major_outage: 'critical',
};

const PLATFORM_LABEL: Record<string, string> = {
  none: 'Tüm sistemler çalışıyor',
  operational: 'Çalışıyor',
  minor: 'Küçük aksaklık',
  degraded_performance: 'Performans düşük',
  under_maintenance: 'Bakımda',
  maintenance: 'Bakımda',
  major: 'Büyük kesinti',
  partial_outage: 'Kısmi kesinti',
  critical: 'Kritik kesinti',
  major_outage: 'Tam kesinti',
};

const INCIDENT_STATUS_LABEL: Record<string, string> = {
  investigating: 'İnceleniyor',
  identified: 'Neden bulundu',
  monitoring: 'İzleniyor',
  resolved: 'Çözüldü',
  postmortem: 'Olay sonrası rapor',
  scheduled: 'Planlandı',
  in_progress: 'Sürüyor',
  verifying: 'Doğrulanıyor',
  completed: 'Tamamlandı',
};

export function platformTone(value: string | null | undefined): PlatformTone {
  return PLATFORM_TONE[String(value ?? '').toLowerCase()] ?? 'unknown';
}
export function platformLabel(value: string | null | undefined): string {
  const v = String(value ?? '').toLowerCase();
  return PLATFORM_LABEL[v] ?? (v ? 'Bilinmeyen durum' : 'Bilinmiyor');
}
export function incidentStatusLabel(value: string | null | undefined): string {
  const v = String(value ?? '').toLowerCase();
  return INCIDENT_STATUS_LABEL[v] ?? 'Bilinmeyen aşama';
}

export const PLATFORM_TONE_UI: Record<PlatformTone, Tone> = {
  ok: 'success',
  warn: 'warning',
  maintenance: 'info',
  error: 'danger',
  critical: 'danger',
  unknown: 'neutral',
};

export const HEALTH_TONE: Record<HealthStatus, Tone> = { ok: 'success', warn: 'warning', error: 'danger', unknown: 'neutral' };
export const HEALTH_LABEL: Record<HealthStatus, string> = { ok: 'Sağlıklı', warn: 'Dikkat', error: 'Sorun var', unknown: 'Bilinmiyor' };

// ───────────── Sorunlar ─────────────

export type Issue = {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  detail: string;
  href: string;
  /** Harici bağlantı (Statuspage) mı? */
  external?: boolean;
  actionLabel: string;
};

export type ObservabilitySnapshot = {
  window: ObsWindow;
  generatedAt: string;
  health: Section<HealthView>;
  traffic: Section<TrafficView>;
  vitals: Section<VitalsView>;
  platform: Section<PlatformView>;
  jobs: Section<{ overall: HealthStatus; detail: string; failing: string[]; lastRunAt: string | null }>;
  issues: Issue[];
};

// ───────────── Arka plan işleri ─────────────

export type JobCadenceView = { kind: 'daily' } | { kind: 'weekly'; weekday: number } | { kind: 'monthly'; day: number };
export type JobRunStatus = 'ok' | 'failed' | 'timeout' | 'skipped_not_due' | 'skipped_budget';

export type JobHealth = 'ok' | 'failing' | 'overdue' | 'waiting' | 'never' | 'budget';

export type JobRow = {
  name: string;
  label: string;
  group: string;
  priority: number;
  cadence: JobCadenceView;
  cadenceLabel: string;
  timeoutMs: number;
  lastRunAt: string | null;
  lastStatus: JobRunStatus | null;
  lastOkAt: string | null;
  lastError: string | null;
  lastMs: number | null;
  consecutiveFailures: number;
  health: JobHealth;
  healthLabel: string;
  /** Bu dönem için başarılı koşu yoksa true → yeniden çalıştırılabilir. */
  due: boolean;
  /** Sıradaki dönem sınırı (ISO). */
  nextBoundaryAt: string;
};

export type JobRunSummaryView = {
  startedAt: string;
  finishedAt: string | null;
  overall: 'ok' | 'partial' | 'failed' | 'interrupted';
  ms: number | null;
  failed: string[];
  skippedBudget: string[];
  ran: number;
};

export type JobsView = {
  generatedAt: string;
  stateReadable: boolean;
  overall: HealthStatus;
  overallDetail: string;
  running: { startedAt: string } | null;
  lastRun: JobRunSummaryView | null;
  history: JobRunSummaryView[];
  jobs: JobRow[];
  /** Kayıtlı ama artık listede olmayan işler (eski ad). */
  orphaned: string[];
  monitors: { heartbeatUrl: boolean; sentryCron: boolean; cronSecret: boolean };
};

export const JOB_HEALTH_META: Record<JobHealth, { label: string; tone: Tone }> = {
  ok: { label: 'Sorunsuz', tone: 'success' },
  failing: { label: 'Hata veriyor', tone: 'danger' },
  overdue: { label: 'Gecikti', tone: 'warning' },
  budget: { label: 'Bütçeden atlandı', tone: 'warning' },
  waiting: { label: 'Gününü bekliyor', tone: 'neutral' },
  never: { label: 'Henüz çalışmadı', tone: 'neutral' },
};

export const RUN_OVERALL_META: Record<JobRunSummaryView['overall'], { label: string; tone: Tone }> = {
  ok: { label: 'Başarılı', tone: 'success' },
  partial: { label: 'Kısmi', tone: 'warning' },
  failed: { label: 'Başarısız', tone: 'danger' },
  interrupted: { label: 'Kesildi', tone: 'danger' },
};

export const JOB_STATUS_LABEL: Record<JobRunStatus, string> = {
  ok: 'Başarılı',
  failed: 'Başarısız',
  timeout: 'Zaman aşımı',
  skipped_not_due: 'Sırası değildi',
  skipped_budget: 'Bütçe doldu',
};

export const runJobBodySchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(300),
});
export type RunJobBody = z.infer<typeof runJobBodySchema>;

export type RunJobResult = {
  name: string;
  status: JobRunStatus | 'not_run';
  ms: number | null;
  error: string | null;
  httpStatus: number;
};
