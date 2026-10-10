/**
 * Dönem sözleşmesi — `{ range, compare }` (yol haritası §4.4/10: zaman
 * Europe/Istanbul'da). Saf fonksiyonlar; React/DOM bağımlılığı yok (Jest).
 *
 *  - Gün = İstanbul takvim günü, `YYYY-MM-DD`, aralık UÇLARI DAHİL.
 *  - `toPeriod()` sunucuya giden biçim: ISO anlar, yarı açık `[from, to)`.
 *  - URL: `?period=last30&compare=previous` ya da `?from=2026-10-01&to=2026-10-07`.
 */

export const ISTANBUL_TZ = 'Europe/Istanbul';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

export type CompareMode = 'none' | 'previous' | 'yoy';

/** İstanbul takvim günleri, uçlar dahil. */
export type DayRange = { from: string; to: string };

export type DateRangeValue = {
  preset: DateRangePreset;
  range: DayRange;
  compare: CompareMode;
};

/** Sunucuya giden dönem: ISO anlar, `[from, to)` yarı açık. */
export type PeriodContract = {
  tz: typeof ISTANBUL_TZ;
  range: { from: string; to: string };
  compare: { from: string; to: string } | null;
};

export const DATE_RANGE_PRESETS: readonly Exclude<DateRangePreset, 'custom'>[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'thisMonth',
  'lastMonth',
  'thisYear',
];

export const COMPARE_MODES: readonly CompareMode[] = ['none', 'previous', 'yoy'];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dayFromUTCDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `YYYY-MM-DD` gerçek bir takvim günü mü? */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return dayFromUTCDate(d) === value;
}

/** Gün dizgisini UTC gece yarısı `Date`'e çevirir (takvim aritmetiği için). */
export function dayToUTCDate(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ISTANBUL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Verilen anın İstanbul takvim günü. */
export function istanbulDay(at: Date | number | string = new Date()): string {
  const d = at instanceof Date ? at : new Date(at);
  const parts = dayFormatter.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(day: string, n: number): string {
  const d = dayToUTCDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayFromUTCDate(d);
}

/** `b - a` gün farkı. */
export function dayDiff(a: string, b: string): number {
  return Math.round((dayToUTCDate(b).getTime() - dayToUTCDate(a).getTime()) / DAY_MS);
}

/** Aralıktaki gün sayısı (uçlar dahil). */
export function rangeLength(range: DayRange): number {
  return dayDiff(range.from, range.to) + 1;
}

function addYearsClamped(day: string, years: number): string {
  const d = dayToUTCDate(day);
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dayFromUTCDate(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
}

/** Hazır dönemi bugünün İstanbul gününe göre çözer. `custom` → bugün. */
export function resolvePreset(preset: DateRangePreset, today: string = istanbulDay()): DayRange {
  const t = dayToUTCDate(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yd = addDays(today, -1);
      return { from: yd, to: yd };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'thisMonth':
      return { from: dayFromUTCDate(new Date(Date.UTC(y, m, 1))), to: today };
    case 'lastMonth':
      return {
        from: dayFromUTCDate(new Date(Date.UTC(y, m - 1, 1))),
        to: dayFromUTCDate(new Date(Date.UTC(y, m, 0))),
      };
    case 'thisYear':
      return { from: `${y}-01-01`, to: today };
    case 'custom':
    default:
      return { from: today, to: today };
  }
}

/** Karşılaştırma aralığı: önceki eşit uzunlukta dönem ya da geçen yılın aynı günleri. */
export function compareRangeFor(range: DayRange, mode: CompareMode): DayRange | null {
  if (mode === 'none') return null;
  if (mode === 'yoy') return { from: addYearsClamped(range.from, -1), to: addYearsClamped(range.to, -1) };
  const len = rangeLength(range);
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

/** İstanbul'un verilen UTC anındaki ofseti (ms). Türkiye 2016'dan beri +03:00; yine de Intl'den okunur. */
function istanbulOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ISTANBUL_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  return asUTC - Math.floor(utcMs / 1000) * 1000;
}

/** İstanbul gününün başladığı an (UTC `Date`). */
export function istanbulDayStart(day: string): Date {
  const guess = dayToUTCDate(day).getTime();
  const first = guess - istanbulOffsetMs(guess);
  const second = guess - istanbulOffsetMs(first);
  return new Date(second);
}

/** Gün aralığını sunucu sözleşmesine çevirir (`[from, to)`, ISO). */
export function dayRangeToInstants(range: DayRange): { from: string; to: string } {
  return {
    from: istanbulDayStart(range.from).toISOString(),
    to: istanbulDayStart(addDays(range.to, 1)).toISOString(),
  };
}

export function toPeriod(value: DateRangeValue): PeriodContract {
  const cmp = compareRangeFor(value.range, value.compare);
  return {
    tz: ISTANBUL_TZ,
    range: dayRangeToInstants(value.range),
    compare: cmp ? dayRangeToInstants(cmp) : null,
  };
}

export type DateRangeUrlKeys = { period: string; from: string; to: string; compare: string };

export const DEFAULT_DATE_RANGE_KEYS: DateRangeUrlKeys = {
  period: 'period',
  from: 'from',
  to: 'to',
  compare: 'compare',
};

function isPreset(v: unknown): v is DateRangePreset {
  return typeof v === 'string' && (DATE_RANGE_PRESETS as readonly string[]).includes(v);
}

function isCompare(v: unknown): v is CompareMode {
  return typeof v === 'string' && (COMPARE_MODES as readonly string[]).includes(v);
}

export type ParseDateRangeOptions = {
  keys?: Partial<DateRangeUrlKeys>;
  defaultPreset?: Exclude<DateRangePreset, 'custom'>;
  defaultCompare?: CompareMode;
  today?: string;
  /** Özel aralıkta izin verilen en uzun süre (gün). */
  maxDays?: number;
};

/** URL'den dönemi okur; geçersiz/eksik değerde varsayılana düşer (asla patlamaz). */
export function parseDateRange(
  params: { get(key: string): string | null },
  opts: ParseDateRangeOptions = {},
): DateRangeValue {
  const keys = { ...DEFAULT_DATE_RANGE_KEYS, ...opts.keys };
  const today = opts.today ?? istanbulDay();
  const fallbackPreset = opts.defaultPreset ?? 'last30';
  const cmpRaw = params.get(keys.compare);
  const compare: CompareMode = isCompare(cmpRaw) ? cmpRaw : opts.defaultCompare ?? 'none';

  const from = params.get(keys.from);
  const to = params.get(keys.to);
  if (isValidDay(from) && isValidDay(to)) {
    let range: DayRange = from <= to ? { from, to } : { from: to, to: from };
    if (opts.maxDays && rangeLength(range) > opts.maxDays) {
      range = { from: addDays(range.to, -(opts.maxDays - 1)), to: range.to };
    }
    return { preset: 'custom', range, compare };
  }

  const p = params.get(keys.period);
  const preset = isPreset(p) && p !== 'custom' ? p : fallbackPreset;
  return { preset, range: resolvePreset(preset, today), compare };
}

/** Dönemi URL patch'ine çevirir (varsayılanlar URL'ye yazılmaz). */
export function serializeDateRange(
  value: DateRangeValue,
  opts: Pick<ParseDateRangeOptions, 'keys' | 'defaultPreset' | 'defaultCompare'> = {},
): Record<string, string | null> {
  const keys = { ...DEFAULT_DATE_RANGE_KEYS, ...opts.keys };
  const compare = value.compare === (opts.defaultCompare ?? 'none') ? null : value.compare;
  if (value.preset === 'custom') {
    return { [keys.period]: null, [keys.from]: value.range.from, [keys.to]: value.range.to, [keys.compare]: compare };
  }
  return {
    [keys.period]: value.preset === (opts.defaultPreset ?? 'last30') ? null : value.preset,
    [keys.from]: null,
    [keys.to]: null,
    [keys.compare]: compare,
  };
}

/** "1–7 Eki 2026" biçiminde kısa aralık etiketi (gün UTC'de biçimlenir → kayma yok). */
export function formatDayRange(range: DayRange, localeTag: string): string {
  const a = dayToUTCDate(range.from);
  const b = dayToUTCDate(range.to);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const full = new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (range.from === range.to) return full.format(a);
  const short = new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${sameYear ? short.format(a) : full.format(a)} – ${full.format(b)}`;
}
