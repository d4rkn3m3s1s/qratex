/**
 * `MetricValue` sözleşmesi ve biçimleyiciler — saf (Jest ile test edilir).
 *
 * Sunucu sayıyı hesaplar ve bu biçimde döner; istemci yalnız biçimler.
 * JSON'a serileşebilir (fonksiyon/ReactNode içermez).
 */

export type MetricFormat = 'number' | 'currency' | 'percent' | 'duration';

/**
 * Değişim türü:
 *  - `percent`: göreli değişim (%), ör. 12.4 → "+%12,4"
 *  - `absolute`: mutlak fark, metrikle aynı biçimde
 *  - `points`: yüzde puanı (oran metriklerinde), ör. 1.5 → "+1,5 puan"
 */
export type DeltaKind = 'percent' | 'absolute' | 'points';

/** Hangi yön iyi? `neutral`: yön iyi/kötü değil (renk nötr, ikon yine yönü gösterir). */
export type GoodDirection = 'up' | 'down' | 'neutral';

export type MetricDelta = {
  value: number;
  kind?: DeltaKind;
  goodDirection?: GoodDirection;
  /** "önceki 30 güne göre" gibi; verilmezse "önceki döneme göre". */
  label?: string;
};

export type DurationUnit = 'ms' | 's' | 'min' | 'h';

export type MetricValue = {
  /** `null` → veri yok ("—"). */
  value: number | null;
  format?: MetricFormat;
  /** ISO 4217, varsayılan TRY. */
  currency?: string;
  /** `duration` biçiminde değerin birimi (varsayılan saniye). */
  durationUnit?: DurationUnit;
  /** Ondalık basamak (varsayılan: tamsayıysa 0, değilse 1; para 2). */
  fractionDigits?: number;
  /** Büyük sayıları kısalt (1,2 B / 3,4 Mn). */
  compact?: boolean;
  /** Birim eki (ör. "puan", "ziyaret"). */
  unit?: string;
  delta?: MetricDelta | null;
  /** Örneklem büyüklüğü. */
  n?: number | null;
  /** Bu değerin altındaki örneklem "düşük örneklem" uyarısı alır. */
  minN?: number;
  /** Mini eğilim serisi (eski → yeni). `null` = boşluk. */
  series?: ReadonlyArray<number | null> | null;
  /** Hesaplandığı an (ISO). */
  asOf?: string | null;
};

/** `percent` biçiminde değer YÜZDE cinsindendir (12.5 → %12,5), oran değil. */
export function formatMetricValue(m: Omit<MetricValue, 'value'> & { value: number | null }, localeTag: string, locale: 'tr' | 'en' = 'tr'): string {
  const v = m.value;
  if (v == null || !Number.isFinite(v)) return '—';
  const format = m.format ?? 'number';
  if (format === 'duration') return formatDuration(toSeconds(v, m.durationUnit ?? 's'), locale);

  const integer = Number.isInteger(v);
  const digits = m.fractionDigits;
  const base: Intl.NumberFormatOptions = m.compact ? { notation: 'compact', maximumFractionDigits: digits ?? 1 } : {};

  if (format === 'currency') {
    return new Intl.NumberFormat(localeTag, {
      style: 'currency',
      currency: m.currency ?? 'TRY',
      minimumFractionDigits: digits ?? (integer ? 0 : 2),
      maximumFractionDigits: digits ?? (integer ? 0 : 2),
      ...base,
    }).format(v);
  }
  if (format === 'percent') {
    return new Intl.NumberFormat(localeTag, {
      style: 'percent',
      maximumFractionDigits: digits ?? 1,
      minimumFractionDigits: digits ?? 0,
    }).format(v / 100);
  }
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: digits ?? (integer ? 0 : 1),
    minimumFractionDigits: digits ?? 0,
    ...base,
  }).format(v);
}

export function toSeconds(value: number, unit: DurationUnit): number {
  switch (unit) {
    case 'ms':
      return value / 1000;
    case 'min':
      return value * 60;
    case 'h':
      return value * 3600;
    case 's':
    default:
      return value;
  }
}

const DURATION_UNITS = {
  tr: { d: 'g', h: 'sa', m: 'dk', s: 'sn' },
  en: { d: 'd', h: 'h', m: 'm', s: 's' },
} as const;

/** Saniyeyi "1 sa 5 dk" / "1h 5m" biçimine çevirir (en fazla `maxParts` birim). */
export function formatDuration(totalSeconds: number, locale: 'tr' | 'en' = 'tr', maxParts = 2): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const u = DURATION_UNITS[locale];
  const sign = totalSeconds < 0 ? '−' : '';
  let s = Math.round(Math.abs(totalSeconds));
  if (s === 0) return locale === 'tr' ? `0 ${u.s}` : `0${u.s}`;
  const parts: Array<[number, string]> = [];
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d) parts.push([d, u.d]);
  if (h) parts.push([h, u.h]);
  if (m) parts.push([m, u.m]);
  if (s) parts.push([s, u.s]);
  const joiner = locale === 'tr' ? ' ' : '';
  return sign + parts.slice(0, maxParts).map(([n, unit]) => `${n}${joiner}${unit}`).join(' ');
}

export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaSentiment = 'positive' | 'negative' | 'neutral';

/** Çok küçük değişim (|v| < epsilon) "değişmedi" sayılır. */
export function deltaDirection(value: number, epsilon = 1e-9): DeltaDirection {
  if (!Number.isFinite(value) || Math.abs(value) < epsilon) return 'flat';
  return value > 0 ? 'up' : 'down';
}

export function deltaSentiment(direction: DeltaDirection, good: GoodDirection = 'up'): DeltaSentiment {
  if (direction === 'flat' || good === 'neutral') return 'neutral';
  return direction === good ? 'positive' : 'negative';
}

/**
 * Değişimi işaretli metne çevirir: "+%12,4", "−3", "+1,5 puan".
 * İşaret metinde DE vardır (renk + ikon + işaret: yalnız renge dayanmaz).
 */
export function formatDelta(
  delta: MetricDelta,
  localeTag: string,
  metric?: Omit<MetricValue, 'value' | 'delta'>,
  locale: 'tr' | 'en' = 'tr',
): string {
  const dir = deltaDirection(delta.value);
  const sign = dir === 'up' ? '+' : dir === 'down' ? '−' : '';
  const abs = Math.abs(delta.value);
  const kind = delta.kind ?? 'percent';
  let body: string;
  if (kind === 'percent') {
    body = new Intl.NumberFormat(localeTag, { style: 'percent', maximumFractionDigits: 1 }).format(abs / 100);
  } else if (kind === 'points') {
    const n = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 }).format(abs);
    body = locale === 'tr' ? `${n} puan` : `${n} pts`;
  } else {
    body = formatMetricValue({ ...(metric ?? {}), value: abs, compact: metric?.compact }, localeTag, locale);
  }
  return `${sign}${body}`;
}

export function isLowSample(n: number | null | undefined, minN: number | undefined): boolean {
  return typeof n === 'number' && typeof minN === 'number' && n < minN;
}
