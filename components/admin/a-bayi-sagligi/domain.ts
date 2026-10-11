/**
 * Bayi Sağlığı — SAF alan modeli (istemci + sunucu + Jest). Prisma/DOM bağımlılığı yok.
 *
 * Denetim (docs/audit/2026-10-08/admin/admin_dealers-health.md) kararları:
 *  - Tek skor, şeffaf bileşenler: Kalite · Yanıt · Aktivite · Operasyon (+ fraud cezası).
 *    Her bileşen puanını ve en büyük cezayı açıklayan sayıları taşır; UI "neden" gösterir.
 *  - Veri yokluğu "sağlıklı" sayılmaz (Bulgu 1): geri bildirimsiz bayide Kalite/Yanıt
 *    "uygulanamaz" olur (ağırlıktan düşer), Aktivite ise sıfırdır → sessiz bayi riskli bandına iner.
 *  - Küçük örneklem (Bulgu 4): puan ortalaması platform ortalamasına doğru Bayes yumuşatılır,
 *    n < MIN_SAMPLE ise güven "düşük" işaretlenir.
 *  - Tek bant sabiti (Bulgu 2): HEALTH_BANDS.
 */

// ───────────────────────────── Sabitler ─────────────────────────────

export const HEALTH_WINDOWS = [7, 30, 90] as const;
export type HealthWindow = (typeof HEALTH_WINDOWS)[number];
export const DEFAULT_WINDOW: HealthWindow = 30;

export function parseWindow(v: unknown): HealthWindow {
  const n = Number(v);
  return (HEALTH_WINDOWS as readonly number[]).includes(n) ? (n as HealthWindow) : DEFAULT_WINDOW;
}

/** Skor bu eşiklerin ALTINDAYSA ilgili banttadır; ≥ watch → sağlıklı. */
export const HEALTH_BANDS = { critical: 40, at_risk: 60, watch: 75 } as const;
export const BAND_KEYS = ['critical', 'at_risk', 'watch', 'healthy'] as const;
export type HealthBand = (typeof BAND_KEYS)[number];

export function bandFor(score: number): HealthBand {
  if (score < HEALTH_BANDS.critical) return 'critical';
  if (score < HEALTH_BANDS.at_risk) return 'at_risk';
  if (score < HEALTH_BANDS.watch) return 'watch';
  return 'healthy';
}

export function isBand(v: unknown): v is HealthBand {
  return typeof v === 'string' && (BAND_KEYS as readonly string[]).includes(v);
}

/** Bileşen tavanları (toplam 100). */
export const COMPONENT_MAX = { quality: 30, responsiveness: 20, activity: 25, operations: 25 } as const;
export type ComponentKey = keyof typeof COMPONENT_MAX;
export const COMPONENT_KEYS = Object.keys(COMPONENT_MAX) as ComponentKey[];

/** Bayes yumuşatma ağırlığı (sanal yorum sayısı). */
export const BAYES_M = 5;
/** Bu sayının altındaki geri bildirimde güven "düşük". */
export const MIN_SAMPLE = 5;
/** Platform ortalaması hesaplanamazsa kullanılan ön değer. */
export const FALLBACK_PLATFORM_MEAN = 4;

export const SEVERITY_PENALTY = { critical: 12, high: 8, medium: 5, low: 2 } as const;
export type IncidentSeverityKey = keyof typeof SEVERITY_PENALTY;
export const REMEDY_PENALTY = 3;
/** Bu süreden uzun bekleyen telafi onayı ek ceza alır. */
export const REMEDY_OVERDUE_HOURS = 48;
export const REMEDY_OVERDUE_PENALTY = 3;
export const FRAUD_PENALTY: Readonly<Record<string, number>> = { flagged: 15, shadow_ban: 30 };

// ───────────────────────────── Sinyaller ─────────────────────────────

/** Bir dönem penceresinde iki kanalın (QR geri bildirimi + tüketim yorumu) birleşik özeti. */
export interface ReviewWindow {
  n: number;
  ratingSum: number;
  replied: number;
  negative: number;
}

export const EMPTY_REVIEWS: ReviewWindow = { n: 0, ratingSum: 0, replied: 0, negative: 0 };

export interface DealerSignals {
  dealerId: string;
  label: string;
  email: string | null;
  createdAt: string;
  fraudStatus: string;
  /** Güncel pencere [now-W, now). */
  reviews: ReviewWindow;
  /** Önceki pencere [now-2W, now-W). */
  prevReviews: ReviewWindow;
  /** İki önceki pencerenin yorum sayısı (önceki dönem aktivite kıyası için). */
  prev2ReviewCount: number;
  consumptions: number;
  prevConsumptions: number;
  prev2Consumptions: number;
  incidents: Record<IncidentSeverityKey, number>;
  remedyQueue: number;
  remedyOverdue: number;
  /** En eski bekleyen telafinin bekleme süresi (saat) — yoksa null. */
  remedyOldestHours: number | null;
  /** Pencere içinde (ve en az 7 gün önce) ilk kez gelen müşteri sayısı. */
  newCustomers: number;
  /** Bunlardan en az ikinci kez gelen. */
  returnedCustomers: number;
}

// ───────────────────────────── Skor ─────────────────────────────

export interface ScoreComponent {
  key: ComponentKey;
  max: number;
  /** null → uygulanamaz (veri yok); ağırlıktan düşer. */
  points: number | null;
  /** Kaybedilen puan (max − points); uygulanamazsa 0. */
  lost: number;
}

export interface HealthBreakdown {
  score: number;
  band: HealthBand;
  components: ScoreComponent[];
  fraudPenalty: number;
  /** Bayes yumuşatılmış ortalama puan (yorum yoksa null). */
  smoothedRating: number | null;
  rawRating: number | null;
  replyRate: number | null;
  /** Güncel / önceki dönem etkinlik oranı (önceki 0 ise null). */
  activityRatio: number | null;
  activity: number;
  prevActivity: number;
  confidence: 'low' | 'ok';
  silent: boolean;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const round1 = (x: number) => Math.round(x * 10) / 10;

export function smoothRating(w: ReviewWindow, platformMean: number): number | null {
  if (w.n <= 0) return null;
  return (w.ratingSum + BAYES_M * platformMean) / (w.n + BAYES_M);
}

export interface ScoreInput {
  reviews: ReviewWindow;
  activity: number;
  prevActivity: number;
  incidents: Record<IncidentSeverityKey, number>;
  remedyQueue: number;
  remedyOverdue: number;
  fraudStatus: string;
}

export function computeHealth(input: ScoreInput, platformMean: number): HealthBreakdown {
  const { reviews } = input;
  const smoothed = smoothRating(reviews, platformMean);
  const quality = smoothed == null ? null : COMPONENT_MAX.quality * clamp01((smoothed - 1) / 4);

  // Yanıt oranı da küçük örneklemde yarıya doğru çekilir: (yanıt + 1) / (n + 2).
  const replyRate = reviews.n > 0 ? reviews.replied / reviews.n : null;
  const responsiveness =
    reviews.n > 0 ? COMPONENT_MAX.responsiveness * clamp01((reviews.replied + 1) / (reviews.n + 2)) : null;

  const activityRatio = input.prevActivity > 0 ? input.activity / input.prevActivity : null;
  let activity: number;
  if (input.activity <= 0) activity = 0;
  else if (activityRatio == null) activity = COMPONENT_MAX.activity;
  else activity = COMPONENT_MAX.activity * clamp01(activityRatio);

  const incidentPenalty = (Object.keys(SEVERITY_PENALTY) as IncidentSeverityKey[]).reduce(
    (s, k) => s + (input.incidents[k] ?? 0) * SEVERITY_PENALTY[k],
    0
  );
  const operations = Math.max(
    0,
    COMPONENT_MAX.operations - incidentPenalty - input.remedyQueue * REMEDY_PENALTY - input.remedyOverdue * REMEDY_OVERDUE_PENALTY
  );

  const raw: Array<[ComponentKey, number | null]> = [
    ['quality', quality],
    ['responsiveness', responsiveness],
    ['activity', activity],
    ['operations', operations],
  ];
  const components: ScoreComponent[] = raw.map(([key, points]) => ({
    key,
    max: COMPONENT_MAX[key],
    points: points == null ? null : round1(points),
    lost: points == null ? 0 : round1(COMPONENT_MAX[key] - points),
  }));

  let earned = 0;
  let possible = 0;
  for (const [key, points] of raw) {
    if (points == null) continue;
    earned += points;
    possible += COMPONENT_MAX[key];
  }
  const fraudPenalty = FRAUD_PENALTY[input.fraudStatus] ?? 0;
  const base = possible > 0 ? (earned / possible) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(base - fraudPenalty)));

  return {
    score,
    band: bandFor(score),
    components,
    fraudPenalty,
    smoothedRating: smoothed == null ? null : Math.round(smoothed * 100) / 100,
    rawRating: reviews.n > 0 ? Math.round((reviews.ratingSum / reviews.n) * 100) / 100 : null,
    replyRate: replyRate == null ? null : round1(replyRate * 100),
    activityRatio: activityRatio == null ? null : Math.round(activityRatio * 100) / 100,
    activity: input.activity,
    prevActivity: input.prevActivity,
    confidence: reviews.n < MIN_SAMPLE ? 'low' : 'ok',
    silent: input.activity <= 0,
  };
}

/** Güncel ve önceki dönem skorları. Olay/telafi ANLIK durumdur → iki dönemde de aynı alınır. */
export function scoreDealer(s: DealerSignals, platformMean: number): { current: HealthBreakdown; previous: HealthBreakdown | null } {
  const ops = {
    incidents: s.incidents,
    remedyQueue: s.remedyQueue,
    remedyOverdue: s.remedyOverdue,
    fraudStatus: s.fraudStatus,
  };
  const current = computeHealth(
    { reviews: s.reviews, activity: s.consumptions + s.reviews.n, prevActivity: s.prevConsumptions + s.prevReviews.n, ...ops },
    platformMean
  );
  const prevActivity = s.prevConsumptions + s.prevReviews.n;
  const previous =
    prevActivity > 0
      ? computeHealth(
          { reviews: s.prevReviews, activity: prevActivity, prevActivity: s.prev2Consumptions + s.prev2ReviewCount, ...ops },
          platformMean
        )
      : null;
  return { current, previous };
}

export function platformMeanOf(signals: readonly DealerSignals[]): number {
  let n = 0;
  let sum = 0;
  for (const s of signals) {
    n += s.reviews.n;
    sum += s.reviews.ratingSum;
  }
  return n > 0 ? Math.round((sum / n) * 100) / 100 : FALLBACK_PLATFORM_MEAN;
}

// ───────────────────────────── Öneriler ─────────────────────────────

export const PLAYBOOK_IDS = ['low_nps_churn', 'first_week_dropoff', 'silent_happy'] as const;
export type PlaybookId = (typeof PLAYBOOK_IDS)[number];
export const ACTION_KEYS = ['reactivate', 'clear_remedy', 'resolve_incidents', 'fraud_review'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export type Recommendation =
  | { kind: 'playbook'; id: PlaybookId; priority: 'high' | 'medium'; evidence: Record<string, number> }
  | { kind: 'action'; id: ActionKey; priority: 'high' | 'medium'; evidence: Record<string, number> };

/** Öneri eşikleri — açıklamada aynı sayılar gösterilir. */
export const RECO_RULES = {
  lowNps: { minReviews: 3, maxSmoothed: 3.6, minNegativeShare: 0.3 },
  dropoff: { minNewCustomers: 5, maxReturnRate: 0.25 },
  silentHappy: { minConsumptions: 10, maxReviewRatio: 0.1, minSmoothed: 4 },
} as const;

/**
 * Bağlamlı öneriler — yalnız gerçek sinyallerden; her öneri kanıt sayılarını taşır.
 * Sıra: yüksek öncelik önce, sonra kural sırası.
 */
export function recommend(s: DealerSignals, h: HealthBreakdown): Recommendation[] {
  const out: Recommendation[] = [];
  const negShare = s.reviews.n > 0 ? s.reviews.negative / s.reviews.n : 0;

  if (s.fraudStatus === 'flagged' || s.fraudStatus === 'shadow_ban') {
    out.push({ kind: 'action', id: 'fraud_review', priority: 'high', evidence: { fraudPenalty: h.fraudPenalty } });
  }
  const severe = (s.incidents.critical ?? 0) + (s.incidents.high ?? 0);
  if (severe > 0) {
    out.push({ kind: 'action', id: 'resolve_incidents', priority: 'high', evidence: { severe, total: totalIncidents(s) } });
  }
  if (s.remedyOverdue > 0) {
    out.push({
      kind: 'action',
      id: 'clear_remedy',
      priority: 'medium',
      evidence: { overdue: s.remedyOverdue, queue: s.remedyQueue, oldestHours: Math.round(s.remedyOldestHours ?? 0) },
    });
  }
  if (
    s.reviews.n >= RECO_RULES.lowNps.minReviews &&
    ((h.smoothedRating != null && h.smoothedRating < RECO_RULES.lowNps.maxSmoothed) || negShare >= RECO_RULES.lowNps.minNegativeShare)
  ) {
    out.push({
      kind: 'playbook',
      id: 'low_nps_churn',
      priority: 'high',
      evidence: { reviews: s.reviews.n, negativePct: Math.round(negShare * 100), smoothed: h.smoothedRating ?? 0 },
    });
  }
  if (s.newCustomers >= RECO_RULES.dropoff.minNewCustomers) {
    const rate = s.returnedCustomers / s.newCustomers;
    if (rate < RECO_RULES.dropoff.maxReturnRate) {
      out.push({
        kind: 'playbook',
        id: 'first_week_dropoff',
        priority: 'medium',
        evidence: { newCustomers: s.newCustomers, returned: s.returnedCustomers, returnPct: Math.round(rate * 100) },
      });
    }
  }
  if (
    s.consumptions >= RECO_RULES.silentHappy.minConsumptions &&
    s.reviews.n / s.consumptions < RECO_RULES.silentHappy.maxReviewRatio &&
    (h.smoothedRating == null || h.smoothedRating >= RECO_RULES.silentHappy.minSmoothed)
  ) {
    out.push({
      kind: 'playbook',
      id: 'silent_happy',
      priority: 'medium',
      evidence: { consumptions: s.consumptions, reviews: s.reviews.n },
    });
  }
  if (h.silent) {
    out.push({ kind: 'action', id: 'reactivate', priority: 'high', evidence: { prevActivity: h.prevActivity } });
  }
  return out.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1));
}

export function totalIncidents(s: Pick<DealerSignals, 'incidents'>): number {
  return Object.values(s.incidents).reduce((a, b) => a + (b ?? 0), 0);
}

// ───────────────────────────── Satır, filtre, sıralama ─────────────────────────────

export interface HealthRow {
  dealerId: string;
  label: string;
  email: string | null;
  fraudStatus: string;
  score: number;
  band: HealthBand;
  /** Önceki döneme göre puan farkı; önceki dönemde etkinlik yoksa null. */
  delta: number | null;
  confidence: 'low' | 'ok';
  silent: boolean;
  reviews: number;
  rawRating: number | null;
  smoothedRating: number | null;
  replyRate: number | null;
  activity: number;
  prevActivity: number;
  openIncidents: number;
  severeIncidents: number;
  remedyQueue: number;
  remedyOldestHours: number | null;
  openCsmTasks: number;
  components: ScoreComponent[];
  fraudPenalty: number;
  /** En çok puan kaybettiren bileşen (yoksa null). */
  topLoss: { key: ComponentKey; lost: number } | null;
  recommendations: Recommendation[];
}

export function buildRow(s: DealerSignals, platformMean: number, openCsmTasks: number): HealthRow {
  const { current, previous } = scoreDealer(s, platformMean);
  const top = [...current.components].filter((c) => c.points != null && c.lost > 0).sort((a, b) => b.lost - a.lost)[0];
  return {
    dealerId: s.dealerId,
    label: s.label,
    email: s.email,
    fraudStatus: s.fraudStatus,
    score: current.score,
    band: current.band,
    delta: previous ? current.score - previous.score : null,
    confidence: current.confidence,
    silent: current.silent,
    reviews: s.reviews.n,
    rawRating: current.rawRating,
    smoothedRating: current.smoothedRating,
    replyRate: current.replyRate,
    activity: current.activity,
    prevActivity: current.prevActivity,
    openIncidents: totalIncidents(s),
    severeIncidents: (s.incidents.critical ?? 0) + (s.incidents.high ?? 0),
    remedyQueue: s.remedyQueue,
    remedyOldestHours: s.remedyOldestHours == null ? null : Math.round(s.remedyOldestHours),
    openCsmTasks,
    components: current.components,
    fraudPenalty: current.fraudPenalty,
    topLoss: top ? { key: top.key, lost: top.lost } : null,
    recommendations: recommend(s, current),
  };
}

export const FLAG_KEYS = ['silent', 'incidents', 'remedy', 'fraud', 'low_confidence', 'csm_open', 'has_playbook', 'declining'] as const;
export type HealthFlag = (typeof FLAG_KEYS)[number];

export const SORT_KEYS = ['score', 'delta', 'label', 'reviews', 'replyRate', 'openIncidents', 'remedyQueue', 'activity'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface ListParams {
  q?: string | null;
  band?: HealthBand | null;
  flag?: HealthFlag | null;
  sort?: string | null;
  page?: number;
  size?: number;
}

/** Türkçe katlamalı arama anahtarı (İ/ı, büyük/küçük). */
export function foldTr(v: string): string {
  return v
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

export function matchesFlag(r: HealthRow, flag: HealthFlag): boolean {
  switch (flag) {
    case 'silent':
      return r.silent;
    case 'incidents':
      return r.openIncidents > 0;
    case 'remedy':
      return r.remedyQueue > 0;
    case 'fraud':
      return r.fraudStatus !== 'clean';
    case 'low_confidence':
      return r.confidence === 'low';
    case 'csm_open':
      return r.openCsmTasks > 0;
    case 'has_playbook':
      return r.recommendations.some((x) => x.kind === 'playbook');
    case 'declining':
      return r.delta != null && r.delta <= -10;
  }
}

export function parseSortParam(v: string | null | undefined): { key: SortKey; desc: boolean } {
  if (!v) return { key: 'score', desc: false };
  const [k, dir] = v.split('.');
  const key = (SORT_KEYS as readonly string[]).includes(k) ? (k as SortKey) : 'score';
  return { key, desc: dir === 'desc' };
}

function sortValue(r: HealthRow, key: SortKey): number | string | null {
  switch (key) {
    case 'label':
      return foldTr(r.label);
    case 'replyRate':
      return r.replyRate;
    case 'delta':
      return r.delta;
    default:
      return r[key];
  }
}

export function filterRows(rows: readonly HealthRow[], p: Pick<ListParams, 'q' | 'band' | 'flag'>): HealthRow[] {
  const q = p.q ? foldTr(p.q.trim()) : '';
  return rows.filter((r) => {
    if (p.band && r.band !== p.band) return false;
    if (p.flag && !matchesFlag(r, p.flag)) return false;
    if (q) {
      const hay = foldTr(`${r.label} ${r.email ?? ''} ${r.dealerId}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Kararlı sıralama: null değerler her yönde sona; eşitlikte etiket. */
export function sortRows(rows: readonly HealthRow[], sort: { key: SortKey; desc: boolean }): HealthRow[] {
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && va !== vb) return (va < vb ? -1 : 1) * dir;
    return foldTr(a.label).localeCompare(foldTr(b.label), 'tr') || a.dealerId.localeCompare(b.dealerId);
  });
}

export interface HealthSummary {
  total: number;
  bands: Record<HealthBand, number>;
  avgScore: number | null;
  avgDelta: number | null;
  silent: number;
  lowConfidence: number;
  withPlaybook: number;
  declining: number;
}

export function summarize(rows: readonly HealthRow[]): HealthSummary {
  const bands: Record<HealthBand, number> = { critical: 0, at_risk: 0, watch: 0, healthy: 0 };
  let sum = 0;
  let dSum = 0;
  let dN = 0;
  let silent = 0;
  let low = 0;
  let pb = 0;
  let declining = 0;
  for (const r of rows) {
    bands[r.band] += 1;
    sum += r.score;
    if (r.delta != null) {
      dSum += r.delta;
      dN += 1;
      if (r.delta <= -10) declining += 1;
    }
    if (r.silent) silent += 1;
    if (r.confidence === 'low') low += 1;
    if (r.recommendations.some((x) => x.kind === 'playbook')) pb += 1;
  }
  return {
    total: rows.length,
    bands,
    avgScore: rows.length ? Math.round((sum / rows.length) * 10) / 10 : null,
    avgDelta: dN ? Math.round((dSum / dN) * 10) / 10 : null,
    silent,
    lowConfidence: low,
    withPlaybook: pb,
    declining,
  };
}

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** Liste görünüm anahtarı — istemci ve sunucu aynısını üretir (sunucu ön verisi yalnız aynı görünümde kullanılır). */
export function listKey(p: { window: number; q?: string | null; band?: string | null; flag?: string | null; sort?: string | null; page?: number; size?: number }): string {
  return JSON.stringify([p.window, p.q ?? '', p.band ?? '', p.flag ?? '', p.sort ?? '', p.page ?? 1, p.size ?? 20]);
}

export function paginate<T>(rows: readonly T[], page = 1, size = 20): { items: T[]; page: number; size: number; total: number } {
  const s = (PAGE_SIZES as readonly number[]).includes(size) ? size : 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / s));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { items: rows.slice((p - 1) * s, p * s), page: p, size: s, total: rows.length };
}

// ───────────────────────────── CSV ─────────────────────────────

const BAND_LABEL_TR: Record<HealthBand, string> = { critical: 'Kritik', at_risk: 'Riskli', watch: 'İzlenmeli', healthy: 'Sağlıklı' };

function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  // CSV formül enjeksiyonu: =,+,-,@ ile başlayan metin hücreleri tırnaklanır ve ' ile etkisizleşir.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: readonly HealthRow[], window: number): string {
  const head = [
    'Bayi',
    'E-posta',
    'Bayi ID',
    'Skor',
    'Bant',
    'Değişim',
    'Güven',
    `Geri bildirim (${window} g)`,
    'Ort. puan',
    'Yumuşatılmış puan',
    'Yanıt oranı (%)',
    'Etkinlik',
    'Önceki etkinlik',
    'Açık olay',
    'Telafi kuyruğu',
    'Açık CSM görevi',
    'Fraud',
    'Kalite',
    'Yanıt',
    'Aktivite',
    'Operasyon',
  ];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    const c = Object.fromEntries(r.components.map((x) => [x.key, x.points]));
    lines.push(
      [
        r.label,
        r.email,
        r.dealerId,
        r.score,
        BAND_LABEL_TR[r.band],
        r.delta,
        r.confidence === 'low' ? 'Düşük' : 'Yeterli',
        r.reviews,
        r.rawRating,
        r.smoothedRating,
        r.replyRate,
        r.activity,
        r.prevActivity,
        r.openIncidents,
        r.remedyQueue,
        r.openCsmTasks,
        r.fraudStatus,
        c.quality,
        c.responsiveness,
        c.activity,
        c.operations,
      ]
        .map(csvCell)
        .join(',')
    );
  }
  // Excel'in UTF-8 Türkçe karakterleri doğru açması için BOM.
  return '﻿' + lines.join('\r\n');
}

// ───────────────────────────── CSM görevleri ─────────────────────────────

export const CSM_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type CsmStatus = (typeof CSM_STATUSES)[number];
export const CSM_PRIORITIES = ['low', 'medium', 'high'] as const;
export type CsmPriority = (typeof CSM_PRIORITIES)[number];

export function normalizeCsmStatus(v: unknown): CsmStatus {
  return typeof v === 'string' && (CSM_STATUSES as readonly string[]).includes(v) ? (v as CsmStatus) : 'open';
}
