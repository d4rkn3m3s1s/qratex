/**
 * Kampanya merkezi — SAF alan modeli (istemci + sunucu + Jest). Prisma/DOM bağımlılığı yok.
 *
 * Şema dalgası bitti; `Campaign` modelinde yalnız şu alanlar var: title, message, targetSegment,
 * channel, status (serbest metin), playbookSourceId, sentAt, sentCount. Bu yüzden:
 *  - Durum makinesi `status` metninde: draft → scheduled → sent → archived; teslimat
 *    başarısızsa failed (taslak gibi düzenlenir/yeniden gönderilir).
 *  - `scheduled` iken `sentAt` = PLANLANAN gönderim anı (İstanbul gününün başı). Gönderimde
 *    gerçek an ile ezilir. Copilot vb. okuyucular yalnız `status: 'sent'` süzdüğü için etkilenmez.
 *  - Alıcı listesi, kontrol grubu ve gönderim sayımları `AuditLog` (`campaign.send`) anlık
 *    görüntüsünde tutulur — performans hunisi bu kesin alıcı kümesinden hesaplanır.
 */

// ───────────────────────────── Segmentler ─────────────────────────────

/**
 * Kampanya kitlesi. Kaynak tek: bayi-yerel müşteri istatistiği (`lib/dealer-customer-stats`,
 * segment merkeziyle AYNI kural). `risk` saklanan eski anahtardır (playbook'lar yazıyor) ve
 * bayi-yerel `at_risk` segmentine karşılık gelir; `active` = son 30 günde bu işletmeye gelen.
 */
export const CAMPAIGN_SEGMENT_KEYS = ['all', 'active', 'new', 'loyal', 'vip', 'risk', 'dormant'] as const;
export type CampaignSegmentKey = (typeof CAMPAIGN_SEGMENT_KEYS)[number];

export function isCampaignSegment(v: unknown): v is CampaignSegmentKey {
  return typeof v === 'string' && (CAMPAIGN_SEGMENT_KEYS as readonly string[]).includes(v);
}

/** Saklanan değeri bilinen segmente çevirir (bilinmeyen → `all` değil, `null`: gönderim reddedilir). */
export function normalizeSegment(v: unknown): CampaignSegmentKey | null {
  if (isCampaignSegment(v)) return v;
  if (v === 'at_risk') return 'risk';
  return null;
}

/** Bayi-yerel segment anahtarı (`DealerSegmentKey`) → kampanya segmenti. */
export const DEALER_SEGMENT_TO_CAMPAIGN = {
  at_risk: 'risk',
  vip: 'vip',
  loyal: 'loyal',
  dormant: 'dormant',
  new: 'new',
} as const;

export const ACTIVE_WINDOW_DAYS = 30;

// ───────────────────────────── Durumlar ─────────────────────────────

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sent', 'failed', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export function normalizeStatus(v: unknown): CampaignStatus {
  return typeof v === 'string' && (CAMPAIGN_STATUSES as readonly string[]).includes(v) ? (v as CampaignStatus) : 'draft';
}

/** Düzenlenebilir / gönderilebilir durumlar. */
export const EDITABLE_STATUSES: readonly CampaignStatus[] = ['draft', 'failed', 'scheduled'];
export const SENDABLE_STATUSES: readonly CampaignStatus[] = ['draft', 'failed', 'scheduled'];
/** Kalıcı silinebilir (hiç gönderilmemiş). Gönderilmiş kampanya silinmez, arşivlenir. */
export const DELETABLE_STATUSES: readonly CampaignStatus[] = ['draft', 'failed'];

export function wasSent(c: { status: string; sentAt: string | Date | null }): boolean {
  const s = normalizeStatus(c.status);
  return s === 'sent' || (s === 'archived' && c.sentAt != null);
}

/** Liste sekmeleri → durum kümeleri. */
export const LIST_TABS = ['drafts', 'scheduled', 'sent', 'archived'] as const;
export type ListTab = (typeof LIST_TABS)[number];
export const TAB_STATUSES: Readonly<Record<ListTab, readonly CampaignStatus[]>> = {
  drafts: ['draft', 'failed'],
  scheduled: ['scheduled'],
  sent: ['sent'],
  archived: ['archived'],
};

export function parseListTab(v: unknown): ListTab {
  return typeof v === 'string' && (LIST_TABS as readonly string[]).includes(v) ? (v as ListTab) : 'drafts';
}

// ───────────────────────────── Sınırlar ─────────────────────────────

export const TITLE_MAX = 200;
/** Push başlığı cihazlarda ~65 karakterden sonra kesilir (rehber, sınır değil). */
export const TITLE_RECOMMENDED = 65;
export const MESSAGE_MAX = 1000;
/** Push gövdesi kilit ekranında ~180 karakter görünür (rehber, sınır değil). */
export const MESSAGE_RECOMMENDED = 180;

/** Tek gönderimdeki en fazla alıcı (son ziyaret edenler önce). */
export const MAX_RECIPIENTS = 1000;
/** Frekans tavanı: aynı müşteri bu işletmeden 7 günde en fazla 2 pazarlama iletisi alır. */
export const FREQUENCY_CAP = { max: 2, days: 7 } as const;

/** Kontrol grubu (holdout) seçenekleri, yüzde. */
export const HOLDOUT_OPTIONS = [0, 10, 20] as const;
export type HoldoutPct = (typeof HOLDOUT_OPTIONS)[number];
/** Kontrol grubu ancak bu büyüklükte bir havuzda anlamlıdır. */
export const HOLDOUT_MIN_POOL = 30;

export function isHoldoutPct(v: unknown): v is HoldoutPct {
  return typeof v === 'number' && (HOLDOUT_OPTIONS as readonly number[]).includes(v);
}

/** Atıf penceresi (gün). */
export const ATTRIBUTION_WINDOWS = [7, 14, 30] as const;
export type AttributionWindow = (typeof ATTRIBUTION_WINDOWS)[number];
export const DEFAULT_ATTRIBUTION_WINDOW: AttributionWindow = 14;

export function parseWindow(v: unknown): AttributionWindow {
  const n = typeof v === 'string' ? Number(v) : v;
  return (ATTRIBUTION_WINDOWS as readonly unknown[]).includes(n) ? (n as AttributionWindow) : DEFAULT_ATTRIBUTION_WINDOW;
}

/** Zamanlama: en erken yarın, en geç 60 gün sonra (İstanbul günü). */
export const SCHEDULE_MIN_DAYS_AHEAD = 1;
export const SCHEDULE_MAX_DAYS_AHEAD = 60;

export const LIST_PAGE_SIZE = 20;

// ───────────────────────────── Kontrol grubu ataması ─────────────────────────────

/** FNV-1a 32 bit — deterministik, ortam bağımsız (Node/tarayıcı aynı sonucu verir). */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Kullanıcının bu kampanyadaki kovası (0-99). Aynı kampanya + kullanıcı → hep aynı kova. */
export function holdoutBucket(campaignId: string, userId: string): number {
  return fnv1a(`${campaignId}:${userId}`) % 100;
}

// ───────────────────────────── Teslim planı ─────────────────────────────

export interface DeliveryPlanInput {
  campaignId: string;
  /** Segment adayları, son etkinliğe göre YENİDEN ESKİYE sıralı (tekrarsız). */
  orderedCandidates: readonly string[];
  /** Pazarlama kapısının (`resolveMarketingAudience`) kanal kümeleri. */
  appUserIds: readonly string[];
  pushUserIds: readonly string[];
  /** Kapının uygun bulmadığı (müşteri değil / anonim / hesap yok) adaylar. */
  ineligibleIds?: readonly string[];
  /** Son FREQUENCY_CAP.days gündeki bu işletmeden pazarlama iletisi sayısı. */
  recentCounts: ReadonlyMap<string, number>;
  holdoutPct: number;
  max?: number;
  frequencyCap?: number;
}

export interface DeliveryPlan {
  candidateCount: number;
  ineligibleCount: number;
  optedOutCount: number;
  frequencyCappedCount: number;
  truncatedCount: number;
  /** Kontrol grubu gerçekten uygulandı mı (havuz yeterince büyük ve yüzde > 0). */
  holdoutApplied: boolean;
  holdoutPct: number;
  holdoutIds: string[];
  recipientIds: string[];
  appUserIds: string[];
  pushUserIds: string[];
}

/**
 * Kimin alacağına karar verir — SAF. Sıra:
 *  1. uygunluk (kapı) → 2. tercih (iki kanal da kapalıysa atla) → 3. frekans tavanı
 *  → 4. en fazla `max` kişilik havuz (en yeni ziyaretçiler önce) → 5. deterministik kontrol grubu.
 */
export function planCampaignDelivery(input: DeliveryPlanInput): DeliveryPlan {
  const max = input.max ?? MAX_RECIPIENTS;
  const cap = input.frequencyCap ?? FREQUENCY_CAP.max;
  const app = new Set(input.appUserIds);
  const push = new Set(input.pushUserIds);
  const ineligible = new Set(input.ineligibleIds ?? []);
  const seen = new Set<string>();

  let ineligibleCount = 0;
  let optedOutCount = 0;
  let frequencyCappedCount = 0;
  const pool: string[] = [];

  for (const id of input.orderedCandidates) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const hasApp = app.has(id);
    const hasPush = push.has(id);
    if (!hasApp && !hasPush) {
      if (ineligible.has(id)) ineligibleCount++;
      else optedOutCount++;
      continue;
    }
    if ((input.recentCounts.get(id) ?? 0) >= cap) {
      frequencyCappedCount++;
      continue;
    }
    pool.push(id);
  }

  const truncatedCount = Math.max(0, pool.length - max);
  const capped = pool.slice(0, max);
  const pct = isHoldoutPct(input.holdoutPct) ? input.holdoutPct : 0;
  const holdoutApplied = pct > 0 && capped.length >= HOLDOUT_MIN_POOL;

  const holdoutIds: string[] = [];
  const recipientIds: string[] = [];
  for (const id of capped) {
    if (holdoutApplied && holdoutBucket(input.campaignId, id) < pct) holdoutIds.push(id);
    else recipientIds.push(id);
  }

  return {
    candidateCount: seen.size,
    ineligibleCount,
    optedOutCount,
    frequencyCappedCount,
    truncatedCount,
    holdoutApplied,
    holdoutPct: holdoutApplied ? pct : 0,
    holdoutIds,
    recipientIds,
    appUserIds: recipientIds.filter((id) => app.has(id)),
    pushUserIds: recipientIds.filter((id) => push.has(id)),
  };
}

// ───────────────────────────── Ölçüm (huni) ─────────────────────────────

export interface ActivityEvent {
  userId: string;
  /** ms */
  at: number;
  /** Tüketim tutarı (TL). Geri bildirim için null. */
  amount: number | null;
  /** Geri bildirim / yorum puanı (1-5). Tüketim için null. */
  rating: number | null;
  /**
   * Ziyaret sayılır mı (varsayılan evet). Tüketim yorumu ziyaretin kendisi değildir (tüketim
   * zaten sayıldı); yalnız puan sinyali taşır → `false`.
   */
  visit?: boolean;
}

export interface GroupOutcome {
  size: number;
  visitors: number;
  spenders: number;
  spend: number;
  ratingSum: number;
  ratingCount: number;
}

/** Bir kullanıcı grubunun [from, to) aralığındaki sonucu. */
export function groupOutcome(members: ReadonlySet<string>, events: readonly ActivityEvent[], from: number, to: number): GroupOutcome {
  const visitors = new Set<string>();
  const spenders = new Set<string>();
  let spend = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  for (const e of events) {
    if (!members.has(e.userId) || e.at < from || e.at >= to) continue;
    if (e.visit !== false) visitors.add(e.userId);
    if (e.amount != null && e.amount > 0) {
      spenders.add(e.userId);
      spend += e.amount;
    }
    if (e.rating != null) {
      ratingSum += e.rating;
      ratingCount++;
    }
  }
  return {
    size: members.size,
    visitors: visitors.size,
    spenders: spenders.size,
    spend: Math.round(spend * 100) / 100,
    ratingSum,
    ratingCount,
  };
}

/** Yüzde (0-100, 1 ondalık). Payda 0 → null (veri yok; "0%" diye uydurulmaz). */
export function pct(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

export function avgRating(o: Pick<GroupOutcome, 'ratingSum' | 'ratingCount'>): number | null {
  return o.ratingCount > 0 ? Math.round((o.ratingSum / o.ratingCount) * 100) / 100 : null;
}

/** Yüzde puanı farkı (a − b), ikisi de varsa. */
export function pointsDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.round((a - b) * 10) / 10;
}

/** Ölçümün anlamlı sayılacağı en küçük grup. */
export const MIN_SAMPLE = 20;
