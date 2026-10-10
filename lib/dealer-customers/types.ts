/**
 * Bayi → Müşteriler (360) yüzeyinin İSTEMCİ-GÜVENLİ tipleri ve sabitleri.
 * Sunucu modülleri (`core.ts`, `server.ts`, `actions.server.ts`) ve istemci adası
 * (`components/dealer/b-musteriler/**`) aynı sözleşmeyi buradan okur. DB/Node importu YOK.
 */

/** Bir müşteriye aynı anda birden çok etiket düşebilir (ör. "Uyuyan VIP"). */
export const CUSTOMER_TAGS = ['at_risk', 'vip', 'loyal', 'dormant', 'new'] as const;
export type CustomerTag = (typeof CUSTOMER_TAGS)[number];

/** Geri kazanım bandı: son ziyaretten geçen sürenin müşterinin KENDİ ritmine oranı. */
export const WIN_BACK_BANDS = ['waking', 'sleeping', 'lost'] as const;
export type WinBackBand = (typeof WIN_BACK_BANDS)[number];

export const RISK_LEVELS = ['high', 'medium', 'low', 'unknown'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Liste sıralama alanları (DataTable sütun kimlikleriyle aynı). */
export const LIST_SORT_IDS = ['spend', 'visits', 'avg', 'lastVisit', 'risk'] as const;
export type ListSortId = (typeof LIST_SORT_IDS)[number];
export const LIST_DEFAULT_SORT = 'spend.desc';
export const LIST_PAGE_SIZE = 20;

/** Kayıp riski eşikleri — `lib/dealer-customer-stats.churnBucketOf` ile aynı (tek kaynak oradaki kova). */
export const RISK_HIGH = 0.5;
export const RISK_MEDIUM = 0.3;

/** Bir müşteriye bu işletmeden en fazla bu kadar günde bir pazarlama iletisi/teklif gider. */
export const CONTACT_COOLDOWN_DAYS = 7;
/** Tek gönderimde en fazla alıcı (mesaj). */
export const MAX_MESSAGE_RECIPIENTS = 200;
/** Tek gönderimde en fazla kişisel teklif (her biri ayrı onaylı kayıt). */
export const MAX_OFFER_RECIPIENTS = 50;
/** Bir işletmenin bir günde (İstanbul) ulaşabileceği toplam alıcı. */
export const DAILY_DEALER_RECIPIENT_CAP = 500;
/** Gönderimden sonra "geri döndü" sayılması için ziyaret penceresi (gün). */
export const ATTRIBUTION_WINDOW_DAYS = 14;
/** Bayinin mesaja ekleyebileceği kişisel not. */
export const NOTE_MAX = 280;

export const MESSAGE_TEMPLATES = ['winback', 'thanks', 'welcome', 'checkin'] as const;
export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];

export type ActionAudience =
  | { kind: 'segment'; tag: CustomerTag }
  | { kind: 'band'; band: WinBackBand | 'all' }
  | { kind: 'customers'; refs: string[] };

export type ActionSpec =
  | { type: 'message'; template: MessageTemplate; note?: string }
  | { type: 'personal_offer'; note?: string };

export type NextBestAction = 'reply' | 'personal_offer' | 'winback' | 'thanks' | 'welcome' | null;

export interface CustomerListItem {
  ref: string;
  name: string | null;
  email: string | null;
  image: string | null;
  anonymized: boolean;
  totalSpent: number;
  totalVisits: number;
  avgOrderValue: number;
  firstVisitAt: string | null;
  lastPurchaseAt: string | null;
  daysSinceLast: number | null;
  rhythmDays: number | null;
  predictedChurn: number | null;
  /** Geriye uyum: 'HIGH' | 'MEDIUM' | 'LOW' | null. */
  churnRisk: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  risk: RiskLevel;
  tags: CustomerTag[];
  band: WinBackBand | null;
  reviewCount: number;
  avgRating: number | null;
  /** Platform güven skoru bayiye verilmez (yalnız kaba "güvenilir" rozeti). */
  trustScore: null;
  trustTier: 'trusted' | null;
}

export interface CustomerListPage {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  source: 'persisted' | 'live';
  calculatedAt: string | null;
}

export interface CustomersSummary {
  total: number;
  active30: number;
  newThisMonth: number;
  atRisk: number;
  dormant: number;
  bands: Record<WinBackBand, number>;
  tags: Record<CustomerTag, number>;
  totalRevenue: number;
  avgCustomerValue: number | null;
  repeatRate: number | null;
  source: 'persisted' | 'live';
  calculatedAt: string | null;
  /** Kalıcı özet 36 saatten eski mi (günlük iş aksamış olabilir)? */
  stale: boolean;
}

export type TimelineKind = 'visit' | 'feedback' | 'review' | 'remedy' | 'message';

export interface CustomerTimelineItem {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail: string | null;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
}

export interface CustomerSignal {
  id: string;
  type: 'feedback' | 'review';
  rating: number;
  text: string | null;
  sentiment: string | null;
  churnRisk: number | null;
  replied: boolean;
  reply: string | null;
  at: string;
}

export interface CustomerDetail extends CustomerListItem {
  reasons: string[];
  suggestion: NextBestAction;
  reachable: boolean;
  contactedRecently: boolean;
  lastContactAt: string | null;
  openOffer: { status: string; at: string } | null;
  signals: CustomerSignal[];
  timeline: CustomerTimelineItem[];
}

export interface RiskRow {
  ref: string;
  name: string | null;
  image: string | null;
  anonymized: boolean;
  churn: number;
  risk: RiskLevel;
  lastPurchaseAt: string | null;
  daysSinceLast: number | null;
  totalSpent: number;
  status: 'open' | 'handled' | 'recovered';
  signal: CustomerSignal | null;
}

export interface InterventionConfigDto {
  enabled: boolean;
  /** Yüzde (0-100). */
  thresholdPercent: number;
  inactiveDays: number;
  autoOffer: boolean;
  maxPerRun: number;
}

export interface InterventionRunDto {
  day: string;
  flagged: number;
  offers: number;
  customers: Array<{ ref: string; name: string | null }>;
}

export interface RiskOverview {
  rows: RiskRow[];
  counts: { open: number; handled: number; recovered: number };
  distribution: Record<RiskLevel, number>;
  avgRisk: number | null;
  weekly: Array<number | null>;
  weeklyN: number;
  anonymousHighRisk30d: number;
  flaggedExcluded30d: number;
  intervention: { config: InterventionConfigDto; runs: InterventionRunDto[] };
}

export interface WinBackRow {
  ref: string;
  name: string | null;
  image: string | null;
  anonymized: boolean;
  band: WinBackBand;
  daysSinceLast: number;
  rhythmDays: number | null;
  visits: number;
  avgOrderValue: number;
  totalSpent: number;
  priority: number;
  contacted: boolean;
}

export interface WinBackOverview {
  rows: WinBackRow[];
  total: number;
  bands: Record<WinBackBand, number>;
  monthlyAtStake: number;
  results30d: { runs: number; sent: number; returned: number; revenue: number };
}

export interface SegmentCard {
  tag: CustomerTag;
  /** Geriye uyum (eski segment merkezi): Türkçe ad. */
  name: string;
  count: number;
  share: number;
  totalSpend: number;
  avgSpend: number | null;
  avgRisk: number | null;
  lastAction: { at: string; sent: number } | null;
}

export interface SegmentsOverview {
  segments: SegmentCard[];
  totalCustomers: number;
  untagged: number;
  vipThreshold: number | null;
  source: 'persisted' | 'live';
  calculatedAt: string | null;
}

export interface ActionPreview {
  candidates: number;
  eligible: number;
  skipped: { optedOut: number; cooldown: number; ineligible: number; overCap: number };
  cap: number;
  dailyRemaining: number;
  sample: { title: string; message: string };
  offerOptions: Array<{ type: string; label: string; unit: string; values: number[] }> | null;
}

export interface ActionResult {
  runId: string;
  sent: number;
  offersCreated: number;
  conflicts: number;
  skipped: ActionPreview['skipped'];
}

export interface ActionHistoryItem {
  id: string;
  at: string;
  action: 'message' | 'personal_offer';
  template: MessageTemplate | null;
  audienceLabel: string;
  sent: number;
  returned: number;
  revenue: number;
  /** Atıf penceresi henüz kapanmadı mı? */
  windowOpen: boolean;
}
