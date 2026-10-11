/**
 * Admin › Komuta Merkezi (`/admin`) — paylaşılan sözleşme (sunucu yükleyici ↔ BFF ↔ istemci adası).
 *
 * `/admin`, `/admin/platform-pulse` ve `/admin/ecosystem` bu tek yüzeyde birleşti
 * (yol haritası §4.3 "Genel Bakış → Komuta Merkezi"). Her bölüm kendi sonucunu taşır:
 * bir bölüm düşerse yalnız o bölüm hata gösterir ("200 + sıfırlar" yok, §4.4-9).
 */
import type { MetricValue } from '@/components/ds/data/metric-format';

export const COMMAND_RANGES = ['24h', '7d', '30d'] as const;
export type CommandRange = (typeof COMMAND_RANGES)[number];
export const DEFAULT_COMMAND_RANGE: CommandRange = '7d';

export function isCommandRange(v: unknown): v is CommandRange {
  return typeof v === 'string' && (COMMAND_RANGES as readonly string[]).includes(v);
}

/** Bölüm sonucu: başarı ya da görünür hata. */
export type SectionResult<T> =
  | { ok: true; data: T; generatedAt: string }
  | { ok: false; error: string; retryable: boolean };

export type CommandWindow = {
  range: CommandRange;
  unit: 'hour' | 'day';
  /** Pencere başlangıcı (UTC ISO) — İstanbul saat/gün sınırına hizalı. */
  start: string;
  /** Hesap anı (UTC ISO). */
  end: string;
  /** Önceki pencere: aynı geçen süre, hemen öncesi. */
  prevStart: string;
  /** Kova anahtarları (İstanbul yerel saati, `YYYY-MM-DDTHH`), eskiden yeniye. */
  keys: string[];
};

// ─────────────── KPI + nabız ───────────────

export type KpiKey = 'newUsers' | 'feedback' | 'csat' | 'consumptions' | 'pointsMinted' | 'activeDealers';

export type KpiEntry = {
  key: KpiKey;
  metric: MetricValue;
  /** Kutunun altındaki ek bilgi (ör. harcanan puan). */
  footnote?: string | null;
};

export type PulseSeries = {
  /** QR geri bildirimi + tüketim yorumu (silinmemiş). */
  feedback: number[];
  consumptions: number[];
  newUsers: number[];
};

export type KpiSection = {
  kpis: KpiEntry[];
  pulse: PulseSeries;
};

// ─────────────── Kuyruklar ───────────────

export type QueueTone = 'neutral' | 'success' | 'warning' | 'danger';

export type QueueRow = {
  id: string;
  label: string;
  count: number;
  tone: QueueTone;
  href: string;
  hint?: string | null;
};

export type QueueGroup = {
  id: 'dsr' | 'cases' | 'review';
  title: string;
  description: string;
  href: string;
  /** Grubun ana sayısı (rozet). */
  total: number;
  tone: QueueTone;
  rows: QueueRow[];
};

export type QueueSection = { groups: QueueGroup[]; attention: number };

// ─────────────── Sağlık ───────────────

export type HealthStatus = 'ok' | 'warn' | 'error' | 'unknown';

export type HealthCheck = {
  id: 'database' | 'redis' | 'cron' | 'outbox' | 'ai' | 'mail';
  label: string;
  status: HealthStatus;
  /** Kısa açıklama ("142 ms", "Son koşu 3 sa önce"). */
  detail: string;
  latencyMs?: number | null;
  href: string;
};

export type HealthSection = {
  overall: HealthStatus;
  checks: HealthCheck[];
  environment: { vercelEnv: string | null; region: string | null };
};

// ─────────────── Ekosistem ve bayiler ───────────────

export type EcosystemSection = {
  total: number;
  byRole: Array<{ role: 'CUSTOMER' | 'DEALER' | 'STAFF' | 'ADMIN'; count: number }>;
  flagged: number;
  shadowBanned: number;
  anonymized: number;
};

export type TopDealer = {
  dealerId: string;
  name: string;
  volume: number;
  avgRating: number | null;
};

export type TopDealersSection = { dealers: TopDealer[] };

// ─────────────── Genel bakış yanıtı ───────────────

export type CommandOverview = {
  window: CommandWindow;
  generatedAt: string;
  kpis: SectionResult<KpiSection>;
  queues: SectionResult<QueueSection>;
  ecosystem: SectionResult<EcosystemSection>;
  topDealers: SectionResult<TopDealersSection>;
};

// ─────────────── Son olaylar ───────────────

export const EVENT_ACTORS = ['all', 'admin', 'dealer', 'customer', 'system'] as const;
export type EventActor = (typeof EVENT_ACTORS)[number];

export type CommandEvent = {
  id: string;
  at: string;
  actorName: string;
  actorRole: string | null;
  actorKind: Exclude<EventActor, 'all'>;
  /** İnsan diliyle cümle: "ayarları güncelledi". */
  verb: string;
  entityLabel: string;
  entityId: string | null;
  /** Ham değerler (ipucu için). */
  rawAction: string;
  rawEntity: string;
};

export type CommandEventsPage = {
  events: CommandEvent[];
  nextCursor: string | null;
};

export const COMMAND_QUERY_KEYS = {
  overview: (range: CommandRange) => ['admin-command', 'overview', range] as const,
  health: ['admin-command', 'health'] as const,
  events: (actor: EventActor) => ['admin-command', 'events', actor] as const,
};
