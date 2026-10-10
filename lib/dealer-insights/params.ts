/**
 * İçgörüler — URL ↔ sorgu sözleşmesi (saf; sunucu sayfası, BFF ve istemci aynı fonksiyonu
 * kullanır → aynı React Query anahtarı, aynı Redis anahtarı).
 *
 * URL anahtarları Analitik genel bakışla AYNIDIR (`period`, `from`, `to`, `compare`,
 * `location`): sekmeler arası geçişte dönem ve şube bağlamı korunur. Varsayılan son 30 gün,
 * önceki döneme göre karşılaştırma. Gün İstanbul takvimindedir (eski sayfadaki UTC ay ve
 * yanlış "hafta numarası" hataları bu sözleşmeyle yapısal olarak kapanır).
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
import type { InsightsQuery } from './types';

export const INSIGHTS_DEFAULT_PRESET = 'last30' as const;
export const INSIGHTS_DEFAULT_COMPARE = 'previous' as const;
export const INSIGHTS_MAX_DAYS = 366;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type ParamsLike = { get(key: string): string | null };

export function parseLocationParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === 'none') return 'none';
  return ID_RE.test(raw) ? raw : null;
}

/** URL → sorgu (geçersiz değerler varsayılana düşer; asla patlamaz). */
export function parseInsightsSearch(params: ParamsLike, today?: string): InsightsQuery {
  const dr = parseDateRange(params, {
    defaultPreset: INSIGHTS_DEFAULT_PRESET,
    defaultCompare: INSIGHTS_DEFAULT_COMPARE,
    maxDays: INSIGHTS_MAX_DAYS,
    today,
  });
  return {
    preset: dr.preset,
    range: dr.range,
    compare: dr.compare,
    compareRange: compareRangeFor(dr.range, dr.compare),
    location: parseLocationParam(params.get('location')),
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

/** Kararlı önbellek/sorgu anahtarı parçası. */
export function insightsCacheKey(q: InsightsQuery): string {
  return [q.range.from, q.range.to, q.compare, q.location ?? '-'].join('|');
}

/** Anlatının saklandığı dönem anahtarı (`AIInsightReport.period`). */
export function narrativePeriodKey(q: InsightsQuery): string {
  return `${q.range.from}..${q.range.to}|${q.compare}|${q.location ?? 'all'}`;
}

/** Sorguyu URL parametrelerine çevirir (varsayılanlar yazılmaz). */
export function insightsSearchString(q: InsightsQuery, extra: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams();
  if (q.preset === 'custom') {
    sp.set('from', q.range.from);
    sp.set('to', q.range.to);
  } else if (q.preset !== INSIGHTS_DEFAULT_PRESET) {
    sp.set('period', q.preset);
  }
  if (q.compare !== INSIGHTS_DEFAULT_COMPARE) sp.set('compare', q.compare);
  if (q.location) sp.set('location', q.location);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return sp.toString();
}

/** BFF arama dizgisi (React Query anahtarı da budur; SSR ve istemci aynı fonksiyonu kullanır). */
export function insightsApiSearch(
  q: InsightsQuery,
  lang: 'tr' | 'en',
  extra: Record<string, string | null | undefined> = {}
): string {
  return insightsSearchString(q, { lang: lang === 'en' ? 'en' : null, ...extra });
}

const day = z.string().refine((v) => isValidDay(v), { message: 'Tarih YYYY-AA-GG biçiminde olmalı.' });

const periodFields = {
  period: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).optional(),
  from: day.optional(),
  to: day.optional(),
  compare: z.enum(COMPARE_MODES as unknown as [string, ...string[]]).optional(),
  location: z
    .string()
    .refine((v) => parseLocationParam(v) !== null, { message: 'Şube kimliği geçersiz.' })
    .optional(),
  dealerId: z.string().max(191).optional(),
  /** Anlatı dili (arayüz dili). */
  lang: z.enum(['tr', 'en']).optional(),
};

/** BFF sorgu şeması: geçersiz dönem 400 (serbest metin önbellek anahtarına girmez). */
export const insightsQuerySchema = z
  .object({ ...periodFields, fresh: z.enum(['1']).optional() })
  .refine((v) => (v.from == null) === (v.to == null), { message: 'Özel aralıkta başlangıç ve bitiş birlikte verilmeli.' });

/** Anlatı üretimi gövdesi: dönem + dil + yeniden üret. */
export const insightsPeriodBodySchema = z
  .object({
    period: periodFields.period,
    from: periodFields.from,
    to: periodFields.to,
    compare: periodFields.compare,
    location: periodFields.location,
    lang: periodFields.lang,
    regenerate: z.boolean().optional(),
  })
  .refine((v) => (v.from == null) === (v.to == null), { message: 'Özel aralıkta başlangıç ve bitiş birlikte verilmeli.' });

/** Gövde/sorgu nesnesinden `get()` arayüzü. */
export function objectParams(obj: Record<string, unknown>): ParamsLike {
  return {
    get(key: string) {
      const v = obj[key];
      return typeof v === 'string' && v ? v : null;
    },
  };
}

/** Gelen Kutusu derin bağlantısı (yalnız 7/30/90 gün aralığını bilir; eşleşmiyorsa geniş liste). */
export function inboxHref(q: Pick<InsightsQuery, 'preset' | 'location'>, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  sp.set('status', extra.status ?? 'all');
  const range = q.preset === 'last7' ? '7' : q.preset === 'last30' ? '30' : q.preset === 'last90' ? '90' : null;
  if (range) sp.set('range', range);
  if (q.location) sp.set('source', 'qr');
  for (const [k, v] of Object.entries(extra)) if (k !== 'status' && v) sp.set(k, v);
  return `/dealer/inbox?${sp.toString()}`;
}

/** Ayarlar → AI (öğrenme profili, düzeltme geçmişi, AI anahtarları burada yönetilir). */
export const AI_SETTINGS_HREF = '/dealer/settings?tab=ai';
/** AI Asistan (sohbet tek yerde; `q` ön doldurma). */
export function assistantHref(question?: string): string {
  return question ? `/dealer/assistant?q=${encodeURIComponent(question)}` : '/dealer/assistant';
}
