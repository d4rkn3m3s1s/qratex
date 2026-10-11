/**
 * Admin Analitik — URL ↔ sorgu sözleşmesi (saf). Sunucu sayfası, BFF ve istemci adası aynı
 * fonksiyonu kullanır → aynı React Query anahtarı, aynı Redis anahtarı (rapor B-11, B-16).
 *
 * Dönem `{range, compare}` sözleşmesi `components/ds/page/date-range.ts`'ten: gün İstanbul
 * takviminde, uçlar dahil; SQL'e `[from, to)` anlar. Varsayılan son 30 gün + önceki dönem.
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
import { PLACE_CATEGORY_SLUGS } from '@/lib/places/categories';
import {
  ADMIN_ANALYTICS_SECTIONS,
  REVIEW_SOURCES,
  type AdminAnalyticsQuery,
  type AdminAnalyticsSection,
  type ReviewSource,
  type SectorFilter,
} from './types';

export const ADMIN_ANALYTICS_DEFAULT_PRESET = 'last30' as const;
export const ADMIN_ANALYTICS_DEFAULT_COMPARE = 'previous' as const;
export const ADMIN_ANALYTICS_MAX_DAYS = 366;
export const ADMIN_ANALYTICS_PRESETS = ['last7', 'last30', 'last90', 'thisMonth', 'lastMonth', 'thisYear'] as const;

type ParamsLike = { get(key: string): string | null };

const SECTOR_VALUES: readonly string[] = [...PLACE_CATEGORY_SLUGS, 'none'];

export function parseSector(raw: string | null | undefined): SectorFilter | null {
  return raw && SECTOR_VALUES.includes(raw) ? (raw as SectorFilter) : null;
}

export function parseSource(raw: string | null | undefined): ReviewSource {
  return raw && (REVIEW_SOURCES as readonly string[]).includes(raw) ? (raw as ReviewSource) : 'all';
}

/** Temiz veri varsayılan AÇIK; yalnız `clean=0` kapatır. */
export function parseClean(raw: string | null | undefined): boolean {
  return raw !== '0';
}

export function parseSection(raw: string | null | undefined): AdminAnalyticsSection {
  return raw && (ADMIN_ANALYTICS_SECTIONS as readonly string[]).includes(raw) ? (raw as AdminAnalyticsSection) : 'overview';
}

/** URL → sorgu (geçersiz değerler varsayılana düşer; asla patlamaz). */
export function parseAdminAnalyticsSearch(params: ParamsLike, today?: string): AdminAnalyticsQuery {
  const dr = parseDateRange(params, {
    defaultPreset: ADMIN_ANALYTICS_DEFAULT_PRESET,
    defaultCompare: ADMIN_ANALYTICS_DEFAULT_COMPARE,
    maxDays: ADMIN_ANALYTICS_MAX_DAYS,
    today,
  });
  return {
    preset: dr.preset,
    range: dr.range,
    compare: dr.compare,
    compareRange: compareRangeFor(dr.range, dr.compare),
    source: parseSource(params.get('source')),
    clean: parseClean(params.get('clean')),
    sector: parseSector(params.get('sector')),
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

export interface Instants {
  from: Date;
  to: Date;
}

export function toInstants(range: DayRange): Instants {
  const r = dayRangeToInstants(range);
  return { from: new Date(r.from), to: new Date(r.to) };
}

/** Önbellek/sorgu anahtarı (kararlı sıra). */
export function adminQueryCacheKey(q: AdminAnalyticsQuery): string {
  return [q.range.from, q.range.to, q.compare, q.source, q.clean ? 'c1' : 'c0', q.sector ?? '-'].join('|');
}

/** Sorgu → URL parametreleri (varsayılanlar yazılmaz). */
export function adminAnalyticsSearchString(q: AdminAnalyticsQuery, extra: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams();
  if (q.preset === 'custom') {
    sp.set('from', q.range.from);
    sp.set('to', q.range.to);
  } else if (q.preset !== ADMIN_ANALYTICS_DEFAULT_PRESET) {
    sp.set('period', q.preset);
  }
  if (q.compare !== ADMIN_ANALYTICS_DEFAULT_COMPARE) sp.set('compare', q.compare);
  if (q.source !== 'all') sp.set('source', q.source);
  if (!q.clean) sp.set('clean', '0');
  if (q.sector) sp.set('sector', q.sector);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return sp.toString();
}

const day = z.string().refine((v) => isValidDay(v), { message: 'Tarih YYYY-AA-GG biçiminde olmalı.' });

/** BFF sorgu şeması: geçersiz dönem/kaynak/sektör 400 (eskiden serbest metin önbelleğe giriyordu). */
export const adminAnalyticsQuerySchema = z
  .object({
    period: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).optional(),
    from: day.optional(),
    to: day.optional(),
    compare: z.enum(COMPARE_MODES as unknown as [string, ...string[]]).optional(),
    source: z.enum(REVIEW_SOURCES as unknown as [string, ...string[]]).optional(),
    clean: z.enum(['0', '1']).optional(),
    sector: z.enum(SECTOR_VALUES as unknown as [string, ...string[]]).optional(),
    tab: z.string().max(32).optional(),
    fresh: z.enum(['1']).optional(),
  })
  .refine((v) => (v.from == null) === (v.to == null), { message: 'Özel aralıkta başlangıç ve bitiş birlikte verilmeli.' });

export const sectionParamsSchema = z.object({
  section: z.enum(ADMIN_ANALYTICS_SECTIONS as unknown as [string, ...string[]]),
});
