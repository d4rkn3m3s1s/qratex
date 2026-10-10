/**
 * Bayi Etki — saf hesap katmanı (jest). DB/Redis/React yok.
 *
 * Denetim kapanışları:
 *  - ROI B1 / İş sonuçları B3: kıyas EŞ UZUNLUKTA dönemle (`{range, compare}`); adet farkı
 *    yerine oran/yüzde; oranlarda yüzde PUANI; örneklem eşiği altında değişim gösterilmez.
 *  - ROI B2: aksiyonlar `completedAt` ile kovalanır; iptal paydada değil.
 *  - ROI B3 / İş sonuçları B1-B2-B5: "ROI" gerçek veriyle — kapanan döngü geri dönüşü,
 *    kayıtlı ciro, şeffaf varsayımlı tahmin; telafi paydası yalnız müşteriye ULAŞAN teklifler;
 *    tekrar ziyaret DÖNEMLİ oran.
 */
import { z } from 'zod';
import type { MetricValue } from '@/components/ds/data/metric-format';
import {
  COMPARE_MODES,
  DATE_RANGE_PRESETS,
  addDays,
  compareRangeFor,
  dayRangeToInstants,
  isValidDay,
  istanbulDay,
  parseDateRange,
  type DayRange,
} from '@/components/ds/page/date-range';
import {
  CLOSED_LOOP_MIN_ARM,
  DEFAULT_RETURN_WINDOW,
  GOAL_DIRECTION,
  GOAL_KEYS,
  IMPACT_MIN_SAMPLE,
  MAX_BASKET_TRY,
  RETURN_WINDOWS,
  type BasketAssumption,
  type ClosedLoop,
  type GoalProgress,
  type ImpactKpis,
  type ImpactQuery,
  type ImpactSettings,
  type NextStep,
  type ReturnWindow,
  type TrendPoint,
  type Workload,
} from './types';

export const IMPACT_DEFAULT_PRESET = 'last30' as const;
export const IMPACT_DEFAULT_COMPARE = 'previous' as const;
export const IMPACT_MAX_DAYS = 366;

const round = (v: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

// ───────────────────────────── Dönem ─────────────────────────────

type ParamsLike = { get(key: string): string | null };

export function parseImpactSearch(params: ParamsLike, today?: string): ImpactQuery {
  const dr = parseDateRange(params, {
    defaultPreset: IMPACT_DEFAULT_PRESET,
    defaultCompare: IMPACT_DEFAULT_COMPARE,
    maxDays: IMPACT_MAX_DAYS,
    today,
  });
  return { preset: dr.preset, range: dr.range, compare: dr.compare, compareRange: compareRangeFor(dr.range, dr.compare) };
}

export function recordParams(record: Record<string, string | string[] | undefined> | null | undefined): ParamsLike {
  return {
    get(key: string) {
      const v = record?.[key];
      if (Array.isArray(v)) return v[0] ?? null;
      return typeof v === 'string' ? v : null;
    },
  };
}

export interface ImpactInstants {
  from: Date;
  to: Date;
  cmpFrom: Date;
  cmpTo: Date;
  /** Kapanan döngü kohortu [cohortFrom, cohortTo) ve sonucu beklenenler [pendingFrom, to). */
  cohortFrom: Date;
  cohortTo: Date;
  pendingFrom: Date;
}

const NEVER = new Date(0);
const DAY_MS = 86_400_000;

export function impactInstants(q: ImpactQuery, windowDays: ReturnWindow, now: Date): ImpactInstants {
  const cur = dayRangeToInstants(q.range);
  const from = new Date(cur.from);
  const to = new Date(cur.to);
  const cmp = q.compareRange ? dayRangeToInstants(q.compareRange) : null;
  const end = Math.min(to.getTime(), now.getTime());
  const cohortFrom = new Date(from.getTime() - windowDays * DAY_MS);
  const cohortTo = new Date(Math.max(cohortFrom.getTime(), end - windowDays * DAY_MS));
  const pendingFrom = new Date(Math.max(from.getTime(), cohortTo.getTime()));
  return {
    from,
    to,
    cmpFrom: cmp ? new Date(cmp.from) : NEVER,
    cmpTo: cmp ? new Date(cmp.to) : NEVER,
    cohortFrom,
    cohortTo,
    pendingFrom,
  };
}

/** Kohort aralığı (gösterim için İstanbul günleri, uçlar dahil); boşsa null. */
export function cohortDays(inst: ImpactInstants, range: DayRange, windowDays: ReturnWindow): DayRange | null {
  if (inst.cohortTo.getTime() <= inst.cohortFrom.getTime()) return null;
  return { from: addDays(range.from, -windowDays), to: istanbulDay(new Date(inst.cohortTo.getTime() - 1)) };
}

const dayParam = z.string().refine((v) => isValidDay(v), { message: 'Tarih YYYY-AA-GG biçiminde olmalı.' });

/** BFF sorgu şeması: geçersiz dönem 400 (serbest metin önbellek anahtarına girmez). */
export const impactQuerySchema = z
  .object({
    period: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).optional(),
    from: dayParam.optional(),
    to: dayParam.optional(),
    compare: z.enum(COMPARE_MODES as unknown as [string, ...string[]]).optional(),
    fresh: z.enum(['0', '1']).optional(),
    dealerId: z.string().max(191).optional(),
  })
  .refine((v) => (v.from == null) === (v.to == null), { message: 'Özel aralıkta başlangıç ve bitiş birlikte verilmeli.' });

/** Sorguyu URL parametrelerine çevirir (varsayılanlar yazılmaz). */
export function impactSearchString(q: Pick<ImpactQuery, 'preset' | 'range' | 'compare'>): string {
  const sp = new URLSearchParams();
  if (q.preset === 'custom') {
    sp.set('from', q.range.from);
    sp.set('to', q.range.to);
  } else if (q.preset !== IMPACT_DEFAULT_PRESET) {
    sp.set('period', q.preset);
  }
  if (q.compare !== IMPACT_DEFAULT_COMPARE) sp.set('compare', q.compare);
  return sp.toString();
}

// ───────────────────────────── Ayarlar ─────────────────────────────

export const impactSettingsKey = (dealerId: string) => `dealer-impact:v1:${dealerId}`;

const pct = z.number().finite().min(0).max(100);
export const impactSettingsSchema = z
  .object({
    returnWindowDays: z.union([z.literal(14), z.literal(30), z.literal(60)]),
    basketTry: z.number().finite().positive().max(MAX_BASKET_TRY).nullable(),
    goals: z
      .object({
        replyRate: pct.optional(),
        medianReplyHours: z.number().finite().min(0.25).max(720).optional(),
        negativeShare: pct.optional(),
        returningRate: pct.optional(),
        recoveryRate: pct.optional(),
      })
      .strict(),
  })
  .strict();

export type ImpactSettingsInput = z.infer<typeof impactSettingsSchema>;

export const DEFAULT_IMPACT_SETTINGS: ImpactSettings = {
  returnWindowDays: DEFAULT_RETURN_WINDOW,
  basketTry: null,
  goals: {},
  updatedAt: null,
};

/** Kayıtlı JSON'u güvenle okur (bozuk alan → varsayılan; asla patlamaz). */
export function normalizeImpactSettings(raw: unknown): ImpactSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_IMPACT_SETTINGS, goals: {} };
  const o = raw as Record<string, unknown>;
  const win = (RETURN_WINDOWS as readonly number[]).includes(o.returnWindowDays as number)
    ? (o.returnWindowDays as ReturnWindow)
    : DEFAULT_RETURN_WINDOW;
  const basket =
    typeof o.basketTry === 'number' && Number.isFinite(o.basketTry) && o.basketTry > 0 && o.basketTry <= MAX_BASKET_TRY
      ? o.basketTry
      : null;
  const goals: ImpactSettings['goals'] = {};
  const g = o.goals && typeof o.goals === 'object' ? (o.goals as Record<string, unknown>) : {};
  for (const key of GOAL_KEYS) {
    const v = g[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (key === 'medianReplyHours' ? v >= 0.25 && v <= 720 : v >= 0 && v <= 100) goals[key] = v;
  }
  return { returnWindowDays: win, basketTry: basket, goals, updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null };
}

// ───────────────────────────── Ham satırlar ─────────────────────────────

export interface FeedbackWindow {
  n: number;
  ratingSum: number;
  replied: number;
  negative: number;
  unrepliedNegative: number;
  medianReplySec: number | null;
}

export interface VisitWindow {
  customers: number;
  returning: number;
  visits: number;
  revenue: number;
  amountN: number;
}

export interface RemedyWindow {
  delivered: number;
  accepted: number;
}

export interface ClosedLoopRow {
  replied: boolean;
  matured: boolean;
  customers: number;
  returned: number;
  revenue: number;
}

export const EMPTY_FEEDBACK: FeedbackWindow = { n: 0, ratingSum: 0, replied: 0, negative: 0, unrepliedNegative: 0, medianReplySec: null };
export const EMPTY_VISITS: VisitWindow = { customers: 0, returning: 0, visits: 0, revenue: 0, amountN: 0 };

// ───────────────────────────── Varsayımlar ─────────────────────────────

export function basketAssumption(settings: ImpactSettings, visits: VisitWindow): BasketAssumption {
  const observedAvg = visits.amountN > 0 ? round(visits.revenue / visits.amountN, 2) : null;
  const amountCoverage = visits.visits > 0 ? round((visits.amountN / visits.visits) * 100, 1) : null;
  if (settings.basketTry != null) return { value: settings.basketTry, source: 'custom', observedAvg, amountCoverage };
  if (observedAvg != null) return { value: observedAvg, source: 'observed', observedAvg, amountCoverage };
  return { value: null, source: 'none', observedAvg, amountCoverage };
}

// ───────────────────────────── Kapanan döngü ─────────────────────────────

export function buildClosedLoop(
  rows: readonly ClosedLoopRow[],
  windowDays: ReturnWindow,
  cohort: DayRange | null,
  basket: number | null,
): ClosedLoop {
  const arm = (replied: boolean) => {
    const matured = rows.filter((r) => r.matured && r.replied === replied);
    const customers = matured.reduce((s, r) => s + r.customers, 0);
    const returned = matured.reduce((s, r) => s + r.returned, 0);
    const revenue = matured.reduce((s, r) => s + r.revenue, 0);
    return {
      customers,
      returned,
      rate: customers >= CLOSED_LOOP_MIN_ARM ? round((returned / customers) * 100, 1) : null,
      revenue,
    };
  };
  const r = arm(true);
  const u = arm(false);
  const pending = rows.filter((x) => !x.matured).reduce((s, x) => s + x.customers, 0);
  const liftPoints = r.rate != null && u.rate != null ? round(r.rate - u.rate, 1) : null;
  const extraVisits = liftPoints != null ? round((liftPoints / 100) * r.customers, 1) : null;
  const status: ClosedLoop['status'] =
    r.customers + u.customers === 0 ? 'no_cohort' : r.rate == null || u.rate == null ? 'insufficient' : 'ok';
  return {
    status,
    windowDays,
    cohort: r.customers + u.customers > 0 ? cohort : null,
    replied: { customers: r.customers, returned: r.returned, rate: r.rate },
    unreplied: { customers: u.customers, returned: u.returned, rate: u.rate },
    pending,
    liftPoints,
    returnedRevenue: round(r.revenue, 2),
    estimatedExtraVisits: extraVisits,
    estimatedExtraRevenue: extraVisits != null && basket != null ? round(extraVisits * basket, 2) : null,
  };
}

// ───────────────────────────── KPI'lar ─────────────────────────────

const rate = (num: number, den: number, minDen = 1) => (den >= minDen && den > 0 ? round((num / den) * 100, 1) : null);

function pointsDelta(cur: number | null, cmp: number | null, curN: number, cmpN: number, minN: number, good: 'up' | 'down') {
  if (cur == null || cmp == null || curN < minN || cmpN < minN) return null;
  return { value: round(cur - cmp, 1), kind: 'points' as const, goodDirection: good };
}

function percentDelta(cur: number | null, cmp: number | null, good: 'up' | 'down' | 'neutral') {
  if (cur == null || cmp == null || cmp === 0) return null;
  return { value: round(((cur - cmp) / Math.abs(cmp)) * 100, 1), kind: 'percent' as const, goodDirection: good };
}

export interface KpiInputs {
  fb: FeedbackWindow;
  fbCmp: FeedbackWindow | null;
  visits: VisitWindow;
  visitsCmp: VisitWindow | null;
  remedy: RemedyWindow;
  remedyCmp: RemedyWindow | null;
  actionsClosed: number;
  actionsClosedCmp: number | null;
  trend: readonly TrendPoint[];
}

export function buildKpis(i: KpiInputs): ImpactKpis {
  const minN = IMPACT_MIN_SAMPLE;
  const returning = rate(i.visits.returning, i.visits.customers);
  const returningCmp = i.visitsCmp ? rate(i.visitsCmp.returning, i.visitsCmp.customers) : null;
  const neg = rate(i.fb.negative, i.fb.n);
  const negCmp = i.fbCmp ? rate(i.fbCmp.negative, i.fbCmp.n) : null;
  const reply = rate(i.fb.replied, i.fb.n);
  const replyCmp = i.fbCmp ? rate(i.fbCmp.replied, i.fbCmp.n) : null;
  const recovery = rate(i.remedy.accepted, i.remedy.delivered);
  const recoveryCmp = i.remedyCmp ? rate(i.remedyCmp.accepted, i.remedyCmp.delivered) : null;
  const revenue = i.visits.amountN > 0 ? round(i.visits.revenue, 2) : null;
  const revenueCmp = i.visitsCmp && i.visitsCmp.amountN > 0 ? round(i.visitsCmp.revenue, 2) : null;
  const median = i.fb.replied > 0 && i.fb.medianReplySec != null ? Math.round(i.fb.medianReplySec) : null;
  const medianCmp = i.fbCmp && i.fbCmp.replied > 0 && i.fbCmp.medianReplySec != null ? Math.round(i.fbCmp.medianReplySec) : null;

  const weekly = (f: (p: TrendPoint) => number | null) => i.trend.map(f);

  return {
    returningRate: {
      value: returning,
      format: 'percent',
      n: i.visits.customers,
      minN,
      delta: pointsDelta(returning, returningCmp, i.visits.customers, i.visitsCmp?.customers ?? 0, minN, 'up'),
    },
    negativeShare: {
      value: neg,
      format: 'percent',
      n: i.fb.n,
      minN,
      delta: pointsDelta(neg, negCmp, i.fb.n, i.fbCmp?.n ?? 0, minN, 'down'),
      series: weekly((p) => (p.feedback > 0 ? round((p.negative / p.feedback) * 100, 1) : null)),
    },
    recoveryRate: {
      value: recovery,
      format: 'percent',
      n: i.remedy.delivered,
      minN: 5,
      delta: pointsDelta(recovery, recoveryCmp, i.remedy.delivered, i.remedyCmp?.delivered ?? 0, 5, 'up'),
    },
    revenue: {
      value: revenue,
      format: 'currency',
      currency: 'TRY',
      n: i.visits.amountN,
      delta: percentDelta(revenue, revenueCmp, 'up'),
      series: weekly((p) => (p.visits > 0 ? round(p.revenue, 2) : null)),
    },
    replyRate: {
      value: reply,
      format: 'percent',
      n: i.fb.n,
      minN,
      delta: pointsDelta(reply, replyCmp, i.fb.n, i.fbCmp?.n ?? 0, minN, 'up'),
      series: weekly((p) => (p.feedback > 0 ? round((p.replied / p.feedback) * 100, 1) : null)),
    },
    medianReply: {
      value: median,
      format: 'duration',
      durationUnit: 's',
      n: i.fb.replied,
      minN: 3,
      delta: i.fb.replied >= 3 && (i.fbCmp?.replied ?? 0) >= 3 ? percentDelta(median, medianCmp, 'down') : null,
    },
    actionsClosed: {
      value: i.actionsClosed,
      format: 'number',
      delta: percentDelta(i.actionsClosed, i.actionsClosedCmp, 'up'),
      series: weekly((p) => p.actionsClosed),
    },
  } satisfies Record<keyof ImpactKpis, MetricValue>;
}

// ───────────────────────────── Hedefler ─────────────────────────────

export function goalProgress(settings: ImpactSettings, kpis: ImpactKpis): GoalProgress[] {
  const current: Record<string, number | null> = {
    replyRate: kpis.replyRate.value,
    medianReplyHours: kpis.medianReply.value == null ? null : round(kpis.medianReply.value / 3600, 2),
    negativeShare: kpis.negativeShare.value,
    returningRate: kpis.returningRate.value,
    recoveryRate: kpis.recoveryRate.value,
  };
  const out: GoalProgress[] = [];
  for (const key of GOAL_KEYS) {
    const target = settings.goals[key];
    if (target == null) continue;
    const value = current[key] ?? null;
    const met = value == null ? null : GOAL_DIRECTION[key] === 'up' ? value >= target : value <= target;
    out.push({ key, target, value, met });
  }
  return out;
}

// ───────────────────────────── Trend ─────────────────────────────

/** İstanbul gününün Pazartesisi. */
export function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

export function weekStarts(range: DayRange): string[] {
  const out: string[] = [];
  for (let d = mondayOf(range.from); d <= range.to; d = addDays(d, 7)) out.push(d);
  return out;
}

export interface WeeklyRows {
  feedback: ReadonlyArray<{ week: string; n: number; ratingSum: number; replied: number; negative: number }>;
  visits: ReadonlyArray<{ week: string; visits: number; revenue: number }>;
  actions: ReadonlyArray<{ week: string; closed: number }>;
}

export function buildTrend(range: DayRange, rows: WeeklyRows): TrendPoint[] {
  const fb = new Map(rows.feedback.map((r) => [r.week, r]));
  const vs = new Map(rows.visits.map((r) => [r.week, r]));
  const ac = new Map(rows.actions.map((r) => [r.week, r]));
  return weekStarts(range).map((week) => {
    const f = fb.get(week);
    const v = vs.get(week);
    return {
      week,
      feedback: f?.n ?? 0,
      replied: f?.replied ?? 0,
      avgRating: f && f.n > 0 ? round(f.ratingSum / f.n, 2) : null,
      negative: f?.negative ?? 0,
      actionsClosed: ac.get(week)?.closed ?? 0,
      visits: v?.visits ?? 0,
      revenue: round(v?.revenue ?? 0, 2),
    };
  });
}

// ───────────────────────────── Sonraki adımlar ─────────────────────────────

export const IMPACT_LINKS = {
  unrepliedNegative: '/dealer/inbox?status=new&sentiment=negative',
  remedyApproval: '/dealer/inbox/remedy',
  overdueActions: '/dealer/inbox/assigned',
  recordAmounts: '/dealer/scan',
  setGoals: '#varsayimlar',
} as const;

export function buildNextSteps(w: Workload, basket: BasketAssumption, visits: VisitWindow, hasGoals: boolean): NextStep[] {
  const out: NextStep[] = [];
  if (w.unrepliedNegative > 0) out.push({ kind: 'unreplied_negative', count: w.unrepliedNegative, href: IMPACT_LINKS.unrepliedNegative });
  if (w.awaitingApproval > 0) out.push({ kind: 'remedy_approval', count: w.awaitingApproval, href: IMPACT_LINKS.remedyApproval });
  if (w.overdue > 0) out.push({ kind: 'overdue_actions', count: w.overdue, href: IMPACT_LINKS.overdueActions });
  if (visits.visits > 0 && (basket.amountCoverage ?? 0) < 50) {
    out.push({ kind: 'record_amounts', count: visits.visits - visits.amountN, href: IMPACT_LINKS.recordAmounts });
  }
  if (!hasGoals) out.push({ kind: 'set_goals', count: 0, href: IMPACT_LINKS.setGoals });
  return out;
}
