/**
 * Kampanya merkezi DTO'ları — sunucu yükleyicileri (SSR) ve BFF uçları AYNI şekli döner;
 * istemci React Query önbelleğine aynen girer. Tarihler ISO dizgisi.
 */
import type { AttributionWindow, CampaignSegmentKey, CampaignStatus, ListTab } from './domain';

export interface CampaignDto {
  id: string;
  title: string;
  message: string;
  /** Bilinmeyen eski değer → null (UI uyarır, gönderim reddedilir). */
  segment: CampaignSegmentKey | null;
  status: CampaignStatus;
  /** `scheduled` iken planlanan an; gönderildiyse gerçek gönderim anı. */
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
  updatedAt: string;
  fromPlaybook: boolean;
  /** Kaynak hazır şablonun (playbook) adı, biliniyorsa. */
  playbookTitle: string | null;
}

export interface CampaignListItem extends CampaignDto {
  /** Yalnız gönderilmiş kampanyalar: uygulama içi teslim / açılan (okunan). */
  inAppDelivered: number | null;
  opened: number | null;
  /** `failed` durumunda planlı gönderimin neden yapılamadığı. */
  failureReason: string | null;
}

export interface CampaignListResult {
  tab: ListTab;
  items: CampaignListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: Record<ListTab, number>;
}

export interface CampaignSummary {
  /** Son 30 gün. */
  sentCampaigns: number;
  reached: number;
  inAppDelivered: number;
  opened: number;
  /** Uygulama içi açılma oranı (yüzde) — teslim yoksa null. */
  openRate: number | null;
  scheduledUpcoming: number;
  nextScheduledAt: string | null;
  drafts: number;
}

export interface SegmentAudience {
  key: CampaignSegmentKey;
  /** Segmentteki müşteri sayısı. */
  total: number;
  /** Kampanya bildirimlerine izin veren (uygulama içi veya push açık, hesabı aktif). */
  reachable: number;
}

export interface AudienceOverview {
  segments: SegmentAudience[];
  computedAt: string;
}

export interface SendPreview {
  segment: CampaignSegmentKey | null;
  candidateCount: number;
  ineligibleCount: number;
  optedOutCount: number;
  frequencyCappedCount: number;
  truncatedCount: number;
  holdoutRequested: number;
  holdoutApplied: boolean;
  holdoutCount: number;
  recipientCount: number;
  inAppCount: number;
  pushCount: number;
}

export interface FunnelStep {
  key: 'sent' | 'opened' | 'visited' | 'spent';
  count: number;
  /** Gönderilenlere oranı (yüzde). */
  rate: number | null;
}

export interface OutcomeDto {
  size: number;
  visitors: number;
  visitRate: number | null;
  spenders: number;
  spend: number;
  spendPerMember: number | null;
  avgRating: number | null;
  ratingCount: number;
}

export interface TimelinePoint {
  /** İstanbul günü (YYYY-MM-DD). */
  day: string;
  /** Gönderim gününe göre gün farkı (0 = gönderim günü). */
  offset: number;
  visitors: number;
  spend: number;
}

export type PerformanceState =
  /** Henüz gönderilmedi (taslak / planlı / başarısız). */
  | 'not-sent'
  /** Gönderildi ama alıcı listesi kaydı yok (ölçüm altyapısından önceki gönderim). */
  | 'legacy'
  | 'ready';

export interface CampaignPerformance {
  campaign: CampaignDto;
  state: PerformanceState;
  window: AttributionWindow;
  /** Pencere bitti mi (bitmediyse geçen gün sayısı). */
  windowComplete: boolean;
  daysElapsed: number;
  delivery: {
    /**
     * `snapshot`: gönderim anında kaydedilen kesin alıcı listesi (kanal + kontrol grubu dahil).
     * `notifications`: eski gönderim; alıcılar yalnız uygulama içi bildirim kayıtlarından
     * çıkarıldı (yalnız push alanlar ve kontrol grubu bilinmiyor).
     */
    source: 'snapshot' | 'notifications';
    reach: number;
    inAppDelivered: number;
    pushAttempted: number;
    pushDelivered: number | null;
    optedOut: number | null;
    frequencyCapped: number | null;
    truncated: number | null;
    trigger: 'manual' | 'schedule' | null;
  } | null;
  funnel: FunnelStep[];
  after: OutcomeDto | null;
  before: OutcomeDto | null;
  control: (OutcomeDto & { pct: number }) | null;
  /** Ziyaret oranı farkı (alıcı − kontrol), yüzde puanı. */
  liftPoints: number | null;
  timeline: TimelinePoint[];
  minSample: number;
  computedAt: string;
}

export interface PrefillDraft {
  open: boolean;
  segment: CampaignSegmentKey | null;
  title: string;
  message: string;
  source: string | null;
}
