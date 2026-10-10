/**
 * Bayi Analitik — URL ↔ sorgu sözleşmesi (saf; sunucu sayfası, BFF ve istemci aynı fonksiyonu
 * kullanır → aynı React Query anahtarı, aynı Redis anahtarı).
 *
 * Dönem `{range, compare}` sözleşmesi `components/ds/page/date-range.ts`'ten gelir: gün İstanbul
 * takviminde, uçlar dahil; sunucuya `[from, to)` ISO anlar. Varsayılan: son 30 gün, önceki
 * döneme göre karşılaştırma. Özel aralık en çok 366 gün.
 */
import { z } from 'zod';
import {
  COMPARE_MODES,
  DATE_RANGE_PRESETS,
  compareRangeFor,
  dayRangeToInstants,
  isValidDay,
  parseDateRange,
  type DayRange,
} from '@/components/ds/page/date-range';
import {
  ANALYTICS_CHANNELS,
  HEATMAP_METRICS,
  type AnalyticsChannel,
  type AnalyticsQuery,
  type HeatmapMetric,
  type HeatmapQuery,
} from './types';

export const ANALYTICS_DEFAULT_PRESET = 'last30' as const;
export const ANALYTICS_DEFAULT_COMPARE = 'previous' as const;
export const ANALYTICS_MAX_DAYS = 366;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type ParamsLike = { get(key: string): string | null };

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function parseLocationParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === 'none') return 'none';
  return ID_RE.test(raw) ? raw : null;
}

/** URL → analitik sorgusu (geçersiz değerler varsayılana düşer; asla patlamaz). */
export function parseAnalyticsSearch(params: ParamsLike, today?: string): AnalyticsQuery {
  const dr = parseDateRange(params, {
    defaultPreset: ANALYTICS_DEFAULT_PRESET,
    defaultCompare: ANALYTICS_DEFAULT_COMPARE,
    maxDays: ANALYTICS_MAX_DAYS,
    today,
  });
  const location = parseLocationParam(params.get('location'));
  const channelRaw = pick<AnalyticsChannel>(params.get('channel'), ANALYTICS_CHANNELS, 'all');
  return {
    preset: dr.preset,
    range: dr.range,
    compare: dr.compare,
    compareRange: compareRangeFor(dr.range, dr.compare),
    channel: channelRaw,
    location,
  };
}

export function parseHeatmapSearch(params: ParamsLike, today?: string): HeatmapQuery {
  return {
    ...parseAnalyticsSearch(params, today),
    // Isı haritasında kanal süzgeci yok (metrik seçici kanalı belirler).
    channel: 'all',
    metric: pick<HeatmapMetric>(params.get('metric'), HEATMAP_METRICS, 'feedback'),
  };
}

/** Next `searchParams` kaydını `get()` arayüzüne çevirir. */
export function recordParams(record: Record<string, string | string[] | undefined> | null | undefined): ParamsLike {
  return {
    get(key: string) {
      const v = record?.[key];
      if (Array.isArray(v)) return v[0] ?? null;
      return typeof v === 'string' ? v : null;
    },
  };
}

/** Şube seçiliyse kanal fiilen QR'dır (tüketim yorumu şubeye bağlı değil). */
export function effectiveChannel(q: Pick<AnalyticsQuery, 'channel' | 'location'>): AnalyticsChannel {
  return q.location ? 'qr' : q.channel;
}

export interface Instants {
  from: Date;
  to: Date;
}

export function toInstants(range: DayRange): Instants {
  const r = dayRangeToInstants(range);
  return { from: new Date(r.from), to: new Date(r.to) };
}

/** Önbellek/sorgu anahtarı parçası (kararlı sıra). */
export function queryCacheKey(q: AnalyticsQuery & { metric?: HeatmapMetric }): string {
  return [q.range.from, q.range.to, q.compare, q.channel, q.location ?? '-', q.metric ?? '-'].join('|');
}

/**
 * BFF sorgu şeması (rapor B-16: geçersiz `period` artık 400; eskiden serbest metin önbellek
 * anahtarına giriyordu). Değerler yine `parseAnalyticsSearch` ile çözülür.
 */
const day = z.string().refine((v) => isValidDay(v), { message: 'Tarih YYYY-AA-GG biçiminde olmalı.' });

export const analyticsQuerySchema = z
  .object({
    period: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).optional(),
    from: day.optional(),
    to: day.optional(),
    compare: z.enum(COMPARE_MODES as unknown as [string, ...string[]]).optional(),
    channel: z.enum(ANALYTICS_CHANNELS as unknown as [string, ...string[]]).optional(),
    location: z
      .string()
      .refine((v) => parseLocationParam(v) !== null, { message: 'Şube kimliği geçersiz.' })
      .optional(),
    fresh: z.enum(['1']).optional(),
    dealerId: z.string().max(191).optional(),
  })
  .refine((v) => (v.from == null) === (v.to == null), { message: 'Özel aralıkta başlangıç ve bitiş birlikte verilmeli.' });

export const heatmapQuerySchema = z
  .object({
    period: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).optional(),
    from: day.optional(),
    to: day.optional(),
    compare: z.enum(COMPARE_MODES as unknown as [string, ...string[]]).optional(),
    location: z
      .string()
      .refine((v) => parseLocationParam(v) !== null, { message: 'Şube kimliği geçersiz.' })
      .optional(),
    metric: z.enum(HEATMAP_METRICS as unknown as [string, ...string[]]).optional(),
    fresh: z.enum(['1']).optional(),
    dealerId: z.string().max(191).optional(),
  })
  .refine((v) => (v.from == null) === (v.to == null), { message: 'Özel aralıkta başlangıç ve bitiş birlikte verilmeli.' });

/** Sorguyu URL parametrelerine çevirir (BFF çağrısı ve sekmeler arası bağlam korunumu). */
export function analyticsSearchString(q: AnalyticsQuery, extra: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams();
  if (q.preset === 'custom') {
    sp.set('from', q.range.from);
    sp.set('to', q.range.to);
  } else if (q.preset !== ANALYTICS_DEFAULT_PRESET) {
    sp.set('period', q.preset);
  }
  if (q.compare !== ANALYTICS_DEFAULT_COMPARE) sp.set('compare', q.compare);
  if (q.channel !== 'all') sp.set('channel', q.channel);
  if (q.location) sp.set('location', q.location);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return sp.toString();
}

/** Isı haritası ↔ genel bakış geçişinde dönem/şube bağlamını korur (kanal/metrik sekmeye özgü). */
export function sharedContextSearch(q: AnalyticsQuery): string {
  return analyticsSearchString({ ...q, channel: 'all' });
}

/**
 * Gelen Kutusu derin bağlantısı (drill-down). Gelen kutusu yalnız 7/30/90/tümü aralığını
 * bilir: dönem tam eşleşmiyorsa aralık eklenmez (yanlış süzme yerine geniş liste).
 */
export function inboxHref(
  q: Pick<AnalyticsQuery, 'preset' | 'channel' | 'location'>,
  extra: { qr?: string; sentiment?: 'positive' | 'neutral' | 'negative' | 'pending'; rating?: number } = {},
): string {
  const sp = new URLSearchParams();
  sp.set('status', 'all');
  const range = q.preset === 'last7' ? '7' : q.preset === 'last30' ? '30' : q.preset === 'last90' ? '90' : null;
  if (range) sp.set('range', range);
  if (extra.qr) sp.set('qr', extra.qr);
  else if (q.channel === 'qr' || q.location) sp.set('source', 'qr');
  else if (q.channel === 'consumption') sp.set('source', 'consumption');
  if (extra.sentiment) sp.set('sentiment', extra.sentiment);
  if (extra.rating && extra.rating >= 1 && extra.rating <= 5) sp.set('rating', String(Math.round(extra.rating)));
  return `/dealer/inbox?${sp.toString()}`;
}
