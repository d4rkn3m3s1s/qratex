/**
 * Bayi "Bugün" — saf hesaplar (React/Prisma bağımlılığı yok; Jest ile test edilir).
 *
 * Metrik sözlüğü (tek tanım; denetim dealer.md B8, copilot B11, operations-brief B5-B7):
 *  - Geri bildirim = QR geri bildirimi (Feedback) + tüketim yorumu (ConsumptionReview), silinmemiş.
 *  - Olumsuz = puan ≤ 2; nötr = 3; olumlu = 4-5 (3★ olumsuz SAYILMAZ).
 *  - Yanıtlandı = bayi yanıtı var (`dealerReply` dolu).
 *  - Ortalama puan = ağırlıklı (Σpuan / n); veri yoksa null ("—"), asla 0 değil.
 *  - Dönemler İstanbul takvim günüdür: "son 7 gün" = bugün dahil 7 takvim günü; grafik ve
 *    kartlar AYNI pencereyi kullanır. "Bugün" kıyası = dün aynı saate kadar (yarım gün ↔ tam gün
 *    karşılaştırılmaz).
 */
import { addDays, dayToUTCDate, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import type { MetricValue } from '@/components/ds/data/metric-format';
import { SEVERITY_ORDER, type Severity } from '@/components/ds/data/status-meta';
import type {
  DailyPoint,
  FeedbackSource,
  Greeting,
  NextAction,
  SetupState,
  SetupStep,
  SetupStepKey,
  SuggestionItem,
  TodoPriority,
  WeeklyTheme,
} from './types';

// ───────────────────────────── Bağlantılar ─────────────────────────────

/**
 * Hedef rotalar. Gelen Kutusu (`/dealer/inbox`) sözleşmesi: varsayılan görünüm "Yeni"
 * (yanıt bekleyen), `range=30` son 30 gün, `sentiment=negative` (≤2★ ya da AI olumsuz),
 * `sort=oldest`, kayıt çekmecesi `?id=qr-<id>` / `?id=cr-<id>` (lib/dealer-inbox/core.ts
 * `inboxKey`). Vakalar ve "bana atananlar" alt sayfaları henüz yokken eski rotalar kullanılır;
 * onlar devreye girince kayıt defteri yönlendirmesi sorguyu koruyarak taşır.
 */
export const TODAY_LINKS = {
  inbox: '/dealer/inbox',
  inboxWaiting: '/dealer/inbox?range=30',
  inboxNegative: '/dealer/inbox?sentiment=negative&range=30&sort=oldest',
  remedyApprovals: '/dealer/inbox/remedy',
  incidents: '/dealer/incidents',
  todos: '/dealer/action-items',
  analytics: '/dealer/analytics',
  qrCodes: '/dealer/qr-codes',
  products: '/dealer/products',
  settings: '/dealer/settings',
  scan: '/dealer/scan',
} as const;

/** Gelen Kutusu kayıt çekmecesine derin bağlantı. */
export function feedbackHref(source: FeedbackSource, id: string): string {
  return `${TODAY_LINKS.inbox}?id=${encodeURIComponent(`${source === 'qr' ? 'qr' : 'cr'}-${id}`)}`;
}

// ───────────────────────────── Zaman ─────────────────────────────

const HOUR_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' });

export function istanbulHour(now: Date): number {
  const h = Number(HOUR_FMT.formatToParts(now).find((p) => p.type === 'hour')?.value ?? '0');
  return Number.isFinite(h) ? h % 24 : 0;
}

export function greetingFor(now: Date): Greeting {
  const h = istanbulHour(now);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

/** Verilen İstanbul gününün haftasının Pazartesi'si. */
export function weekStartOf(day: string): string {
  const dow = dayToUTCDate(day).getUTCDay(); // 0 = Pazar
  return addDays(day, -((dow + 6) % 7));
}

/** Son TAMAMLANMIŞ haftanın Pazartesi'si. */
export function latestCompletedWeek(now: Date): string {
  return addDays(weekStartOf(istanbulDay(now)), -7);
}

/** Geçerli bir hafta anahtarı mı (Pazartesi, YYYY-MM-DD)? */
export function isWeekKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = dayToUTCDate(value);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 1;
}

export interface TodayWindows {
  today: string;
  /** Son 7 gün (eski → yeni, bugün dahil). */
  days7: string[];
  todayStart: Date;
  yesterdayStart: Date;
  /** Şu andan 24 saat önce (dün aynı saat). */
  sameTimeYesterday: Date;
  d7Start: Date;
  prev7Start: Date;
  d14Start: Date;
  d30Start: Date;
}

export function todayWindows(now: Date): TodayWindows {
  const today = istanbulDay(now);
  const days7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return {
    today,
    days7,
    todayStart: istanbulDayStart(today),
    yesterdayStart: istanbulDayStart(addDays(today, -1)),
    sameTimeYesterday: new Date(now.getTime() - 24 * 3_600_000),
    d7Start: istanbulDayStart(days7[0]),
    prev7Start: istanbulDayStart(addDays(today, -13)),
    d14Start: istanbulDayStart(addDays(today, -13)),
    d30Start: istanbulDayStart(addDays(today, -29)),
  };
}

export function hoursBetween(from: Date | string | null | undefined, now: Date): number | null {
  if (!from) return null;
  const t = typeof from === 'string' ? Date.parse(from) : from.getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 3_600_000));
}

// ───────────────────────────── Sayı yardımcıları ─────────────────────────────

export function toInt(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Ağırlıklı ortalama; n = 0 → null. */
export function weightedAvg(sum: number, n: number): number | null {
  return n > 0 ? round1(sum / n) : null;
}

/** Yüzde (0-100, 1 ondalık); payda 0 → null. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? round1((part / whole) * 100) : null;
}

/** Göreli değişim (%); önceki 0 ise tanımsız → null (sonsuz yüzde gösterilmez). */
export function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return round1(((cur - prev) / prev) * 100);
}

/** İki nullable değerin farkı (puan/yüzde puanı); biri yoksa null. */
export function diff(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null;
  return round1(cur - prev);
}

// ───────────────────────────── Günlük seri ─────────────────────────────

export interface DailyRow {
  day: string;
  n: number;
  sum: number;
}

/** SQL'den gelen günlük kovaları verilen günlere oturtur (eksik gün = 0, ortalama null). */
export function fillDaily(
  days: readonly string[],
  feedback: ReadonlyArray<DailyRow>,
  consumptions: ReadonlyArray<{ day: string; n: number }>
): DailyPoint[] {
  const fb = new Map<string, DailyRow>();
  for (const r of feedback) {
    const prev = fb.get(r.day);
    fb.set(r.day, prev ? { day: r.day, n: prev.n + r.n, sum: prev.sum + r.sum } : { ...r });
  }
  const cs = new Map<string, number>();
  for (const r of consumptions) cs.set(r.day, (cs.get(r.day) ?? 0) + r.n);
  return days.map((day) => {
    const f = fb.get(day);
    return {
      day,
      feedback: f?.n ?? 0,
      consumptions: cs.get(day) ?? 0,
      avgRating: f ? weightedAvg(f.sum, f.n) : null,
    };
  });
}

// ───────────────────────────── Metrikler ─────────────────────────────

export interface MetricInputs {
  feedbackToday: number;
  feedbackYesterdaySameTime: number;
  consumptionsToday: number;
  consumptionsYesterdaySameTime: number;
  cur7: { n: number; sum: number; replied: number };
  prev7: { n: number; sum: number; replied: number };
  medianFirstResponseSec: number | null;
  daily: DailyPoint[];
  asOf: string;
}

/** Düşük örneklem eşiği (ortalama puan ve oranlar). */
export const MIN_SAMPLE = 5;

export function buildMetrics(i: MetricInputs): {
  feedbackToday: MetricValue;
  consumptionsToday: MetricValue;
  avgRating7d: MetricValue;
  responseRate7d: MetricValue;
  medianFirstResponseSec: number | null;
} {
  const avgCur = weightedAvg(i.cur7.sum, i.cur7.n);
  const avgPrev = weightedAvg(i.prev7.sum, i.prev7.n);
  const rrCur = pct(i.cur7.replied, i.cur7.n);
  const rrPrev = pct(i.prev7.replied, i.prev7.n);
  const avgDelta = diff(avgCur, avgPrev);
  const rrDelta = diff(rrCur, rrPrev);
  return {
    feedbackToday: {
      value: i.feedbackToday,
      format: 'number',
      delta: { value: i.feedbackToday - i.feedbackYesterdaySameTime, kind: 'absolute', goodDirection: 'neutral' },
      series: i.daily.map((d) => d.feedback),
      asOf: i.asOf,
    },
    consumptionsToday: {
      value: i.consumptionsToday,
      format: 'number',
      delta: {
        value: i.consumptionsToday - i.consumptionsYesterdaySameTime,
        kind: 'absolute',
        goodDirection: 'up',
      },
      series: i.daily.map((d) => d.consumptions),
      asOf: i.asOf,
    },
    avgRating7d: {
      value: avgCur,
      format: 'number',
      fractionDigits: 1,
      unit: '/ 5',
      n: i.cur7.n,
      minN: MIN_SAMPLE,
      delta: avgDelta == null ? null : { value: avgDelta, kind: 'absolute', goodDirection: 'up' },
      series: i.daily.map((d) => d.avgRating),
      asOf: i.asOf,
    },
    responseRate7d: {
      value: rrCur,
      format: 'percent',
      n: i.cur7.n,
      minN: MIN_SAMPLE,
      delta: rrDelta == null ? null : { value: rrDelta, kind: 'points', goodDirection: 'up' },
      asOf: i.asOf,
    },
    medianFirstResponseSec: i.medianFirstResponseSec,
  };
}

// ───────────────────────────── Kurulum ─────────────────────────────

export interface SetupSignals {
  businessName: string | null;
  businessDesc: string | null;
  hasUserLocation: boolean;
  activeLocations: number;
  hasQr: boolean;
  hasFeedback: boolean;
  hasProduct: boolean;
}

const SETUP_ORDER: ReadonlyArray<{ key: SetupStepKey; required: boolean; href: string }> = [
  { key: 'profile', required: true, href: `${TODAY_LINKS.settings}#dealer-businessName` },
  { key: 'location', required: true, href: `${TODAY_LINKS.settings}#dealer-address` },
  { key: 'qr', required: true, href: TODAY_LINKS.qrCodes },
  { key: 'firstFeedback', required: true, href: TODAY_LINKS.qrCodes },
  { key: 'product', required: false, href: TODAY_LINKS.products },
];

const filled = (s: string | null | undefined) => typeof s === 'string' && s.trim().length > 0;

/**
 * Kurulum adımları kayıtlardan türetilir (kalıcı bayrak yok). Kart, zorunlu adımlardan biri
 * eksikken görünür; hepsi tamamlanınca kaybolur. "Plan seç" bir kurulum adımı DEĞİLDİR
 * (ücretsiz planda kalan bayide sonsuza dek açık kalıyordu — onboarding B3).
 */
export function buildSetup(s: SetupSignals): SetupState {
  const done: Record<SetupStepKey, boolean> = {
    profile: filled(s.businessName) && filled(s.businessDesc),
    location: s.hasUserLocation || s.activeLocations > 0,
    qr: s.hasQr,
    firstFeedback: s.hasFeedback,
    product: s.hasProduct,
  };
  const steps: SetupStep[] = SETUP_ORDER.map((o) => ({ key: o.key, required: o.required, href: o.href, done: done[o.key] }));
  const required = steps.filter((st) => st.required);
  const requiredDone = required.filter((st) => st.done).length;
  const next = required.find((st) => !st.done) ?? null;
  return {
    visible: requiredDone < required.length,
    steps,
    required: { done: requiredDone, total: required.length },
    nextKey: next?.key ?? null,
  };
}

// ───────────────────────────── Sıradaki en iyi adımlar ─────────────────────────────

export interface ActionSignals {
  remedyAwaiting: number;
  remedyOldestAwaitingHours: number | null;
  unansweredNegative: number;
  unansweredNegativeOldestHours: number | null;
  unansweredRecent: number;
  openIncidents: number;
  incidentMaxSeverity: Severity | null;
  overdueTodos: number;
  avgRating7d: number | null;
  avgRatingPrev7d: number | null;
  n7d: number;
  nPrev7d: number;
  weakQr: { name: string; avg: number; n: number } | null;
  hasQr: boolean;
  feedback7d: number;
}

/** Ortalama puanda "düşüş" sayılan eşik (puan). */
export const RATING_DROP_THRESHOLD = 0.3;
/** Zayıf QR eşiği (30 gün ortalaması). */
export const WEAK_QR_THRESHOLD = 3.5;

/**
 * Kural tabanlı, deterministik öneri listesi (LLM yok). Her öğe bir kod + sayı + hedef
 * bağlantı taşır; metni istemci üretir. Önem sırasına göre sıralanır, en fazla `limit`.
 */
export function buildNextActions(s: ActionSignals, limit = 5): NextAction[] {
  const out: NextAction[] = [];
  if (s.unansweredNegative > 0) {
    const oldest = s.unansweredNegativeOldestHours ?? 0;
    out.push({
      kind: 'unanswered_negative',
      severity: oldest >= 24 ? 'critical' : 'high',
      count: s.unansweredNegative,
      href: TODAY_LINKS.inboxNegative,
      params: { oldestHours: oldest },
    });
  }
  if (s.remedyAwaiting > 0) {
    out.push({
      kind: 'remedy_approval',
      severity: 'high',
      count: s.remedyAwaiting,
      href: TODAY_LINKS.remedyApprovals,
      params: { oldestHours: s.remedyOldestAwaitingHours ?? 0 },
    });
  }
  if (s.openIncidents > 0) {
    const sev = s.incidentMaxSeverity ?? 'medium';
    out.push({
      kind: 'open_incidents',
      severity: sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : 'medium',
      count: s.openIncidents,
      href: TODAY_LINKS.incidents,
      params: { maxSeverity: sev },
    });
  }
  if (s.overdueTodos > 0) {
    out.push({ kind: 'overdue_todos', severity: 'medium', count: s.overdueTodos, href: TODAY_LINKS.todos, params: {} });
  }
  if (
    s.avgRating7d != null &&
    s.avgRatingPrev7d != null &&
    s.n7d >= MIN_SAMPLE &&
    s.nPrev7d >= MIN_SAMPLE &&
    s.avgRatingPrev7d - s.avgRating7d >= RATING_DROP_THRESHOLD
  ) {
    out.push({
      kind: 'rating_drop',
      severity: 'medium',
      count: s.n7d,
      href: TODAY_LINKS.analytics,
      params: { from: s.avgRatingPrev7d, to: s.avgRating7d },
    });
  }
  if (s.weakQr && s.weakQr.avg < WEAK_QR_THRESHOLD) {
    out.push({
      kind: 'weak_qr',
      severity: 'low',
      count: s.weakQr.n,
      href: TODAY_LINKS.qrCodes,
      params: { name: s.weakQr.name, avg: s.weakQr.avg, n: s.weakQr.n },
    });
  }
  if (s.unansweredRecent > 0) {
    out.push({ kind: 'unanswered_recent', severity: 'low', count: s.unansweredRecent, href: TODAY_LINKS.inboxWaiting, params: {} });
  }
  if (s.hasQr && s.feedback7d === 0) {
    out.push({ kind: 'quiet_week', severity: 'info', count: 0, href: TODAY_LINKS.qrCodes, params: {} });
  }
  const rank = (sev: Severity) => SEVERITY_ORDER.indexOf(sev);
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a.severity) - rank(y.a.severity) || x.i - y.i)
    .slice(0, limit)
    .map(({ a }) => a);
}

/** Olay önem dizgilerinden en yükseğini seçer (bilinmeyen değerler yok sayılır). */
export function maxSeverity(values: ReadonlyArray<string | null | undefined>): Severity | null {
  let best: Severity | null = null;
  for (const v of values) {
    const s = (v ?? '').toLowerCase() as Severity;
    if (!SEVERITY_ORDER.includes(s)) continue;
    if (best == null || SEVERITY_ORDER.indexOf(s) < SEVERITY_ORDER.indexOf(best)) best = s;
  }
  return best;
}

// ───────────────────────────── AI önerileri ─────────────────────────────

export function normalizeText(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toPriority(v: unknown): TodoPriority {
  const s = String(v ?? '').toLowerCase();
  if (s === 'high' || s === 'critical') return 'high';
  if (s === 'low') return 'low';
  return 'medium';
}

const PRIORITY_RANK: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };

export interface SuggestionSourceRow {
  id: string;
  rating: number;
  createdAt: Date | string;
  actionSuggestions: unknown;
}

/**
 * Geri bildirimlere iliştirilmiş AI önerilerinden henüz takipte olmayanları seçer: metin
 * normalize edilip yinelenenler (aynı öneri farklı yorumlarda) tek satıra iner; zaten açık
 * ya da tamamlanmış aksiyona dönüşmüş metinler (`tracked`) elenir. Öncelik → düşük puan → yeni.
 */
export function pickSuggestions(rows: ReadonlyArray<SuggestionSourceRow>, tracked: ReadonlySet<string>, limit = 3): SuggestionItem[] {
  const seen = new Set<string>(tracked);
  const out: SuggestionItem[] = [];
  for (const row of rows) {
    const list = Array.isArray(row.actionSuggestions) ? row.actionSuggestions : [];
    list.slice(0, 3).forEach((raw, idx) => {
      if (!raw || typeof raw !== 'object') return;
      const text = String((raw as { action?: unknown }).action ?? '').trim().slice(0, 500);
      if (text.length < 4) return;
      const norm = normalizeText(text);
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      out.push({
        key: `${row.id}:${idx}`,
        feedbackId: row.id,
        text,
        priority: toPriority((raw as { priority?: unknown }).priority),
        rating: row.rating,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString(),
      });
    });
  }
  return out
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.rating - b.rating || b.createdAt.localeCompare(a.createdAt)
    )
    .slice(0, limit);
}

// ───────────────────────────── Haftalık temalar ─────────────────────────────

/** `Feedback.themes` JSON'unu ana tema bazında sayar (olumlu/olumsuz kırılımıyla). */
export function countThemes(rows: ReadonlyArray<{ themes: unknown }>): Map<string, { count: number; positive: number; negative: number; label: string }> {
  const map = new Map<string, { count: number; positive: number; negative: number; label: string }>();
  for (const row of rows) {
    const list = Array.isArray(row.themes) ? row.themes : [];
    const seenInRow = new Set<string>();
    for (const t of list) {
      if (!t || typeof t !== 'object') continue;
      const label = String((t as { theme?: unknown }).theme ?? '').trim().slice(0, 60);
      if (!label) continue;
      const key = normalizeText(label);
      if (!key || seenInRow.has(key)) continue;
      seenInRow.add(key);
      const sentiment = String((t as { sentiment?: unknown }).sentiment ?? '').toLowerCase();
      const cur = map.get(key) ?? { count: 0, positive: 0, negative: 0, label };
      cur.count += 1;
      if (sentiment === 'positive') cur.positive += 1;
      else if (sentiment === 'negative') cur.negative += 1;
      map.set(key, cur);
    }
  }
  return map;
}

export function buildThemes(
  cur: ReadonlyArray<{ themes: unknown }>,
  prev: ReadonlyArray<{ themes: unknown }>,
  limit = 6
): WeeklyTheme[] {
  const c = countThemes(cur);
  const p = countThemes(prev);
  return [...c.entries()]
    .map(([key, v]) => ({ label: v.label, count: v.count, positive: v.positive, negative: v.negative, prevCount: p.get(key)?.count ?? 0 }))
    .sort((a, b) => b.count - a.count || b.negative - a.negative || a.label.localeCompare(b.label, 'tr'))
    .slice(0, limit);
}

// ───────────────────────────── Haftalık metrikler ─────────────────────────────

export interface WeekTotals {
  n: number;
  sum: number;
  negative: number;
  replied: number;
  consumptions: number;
}

export function buildWeeklyMetrics(cur: WeekTotals, prev: WeekTotals, asOf: string) {
  const avgCur = weightedAvg(cur.sum, cur.n);
  const avgPrev = weightedAvg(prev.sum, prev.n);
  const negCur = pct(cur.negative, cur.n);
  const negPrev = pct(prev.negative, prev.n);
  const rrCur = pct(cur.replied, cur.n);
  const rrPrev = pct(prev.replied, prev.n);
  const fbChange = pctChange(cur.n, prev.n);
  const csChange = pctChange(cur.consumptions, prev.consumptions);
  const avgD = diff(avgCur, avgPrev);
  const negD = diff(negCur, negPrev);
  const rrD = diff(rrCur, rrPrev);
  return {
    feedback: {
      value: cur.n,
      format: 'number',
      delta: fbChange == null ? null : { value: fbChange, kind: 'percent', goodDirection: 'up' },
      asOf,
    },
    avgRating: {
      value: avgCur,
      format: 'number',
      fractionDigits: 1,
      unit: '/ 5',
      n: cur.n,
      minN: MIN_SAMPLE,
      delta: avgD == null ? null : { value: avgD, kind: 'absolute', goodDirection: 'up' },
      asOf,
    },
    negativeRate: {
      value: negCur,
      format: 'percent',
      n: cur.n,
      minN: MIN_SAMPLE,
      delta: negD == null ? null : { value: negD, kind: 'points', goodDirection: 'down' },
      asOf,
    },
    responseRate: {
      value: rrCur,
      format: 'percent',
      n: cur.n,
      minN: MIN_SAMPLE,
      delta: rrD == null ? null : { value: rrD, kind: 'points', goodDirection: 'up' },
      asOf,
    },
    consumptions: {
      value: cur.consumptions,
      format: 'number',
      delta: csChange == null ? null : { value: csChange, kind: 'percent', goodDirection: 'up' },
      asOf,
    },
  } satisfies Record<string, MetricValue>;
}

/** Metin özetinden (müşteri yorumu) güvenli kısa alıntı. */
export function excerpt(text: string | null | undefined, max = 140): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
