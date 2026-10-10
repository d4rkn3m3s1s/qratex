/**
 * Kıyas + Etki biçimleyicileri (saf). Sunucu sayı döner; istemci yalnız biçimler. Gün dizgileri
 * İstanbul takvim günüdür (`YYYY-MM-DD`) → UTC gece yarısı olarak biçimlenir (kayma yok).
 */
import { formatDuration } from '@/components/ds/data/metric-format';
import type { DsLocale } from '@/components/ds/a11y/copy';

export const tagOf = (locale: DsLocale) => (locale === 'en' ? 'en-GB' : 'tr-TR');

export function fmtNumber(v: number, locale: DsLocale, digits = 0): string {
  return new Intl.NumberFormat(tagOf(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
}

export function fmtRating(v: number, locale: DsLocale): string {
  return new Intl.NumberFormat(tagOf(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

/** Yüzde cinsinden değer (12.5 → "12,5"); işaret yok. */
export function fmtPct(v: number, locale: DsLocale): string {
  return new Intl.NumberFormat(tagOf(locale), { maximumFractionDigits: 1 }).format(v);
}

export function fmtMoney(v: number, locale: DsLocale): string {
  return new Intl.NumberFormat(tagOf(locale), {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2,
  }).format(v);
}

export function fmtSeconds(v: number, locale: DsLocale): string {
  return formatDuration(v, locale);
}

/** Metrik birimine göre biçim (Kıyas rayları). */
export function fmtUnit(v: number | null, unit: 'rating' | 'percent' | 'seconds', locale: DsLocale, withSign = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (unit === 'rating') return fmtRating(v, locale);
  if (unit === 'seconds') return fmtSeconds(v, locale);
  if (!withSign) return fmtPct(v, locale);
  return locale === 'en' ? `${fmtPct(v, locale)}%` : `%${fmtPct(v, locale)}`;
}

export function fmtDay(day: string, locale: DsLocale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat(tagOf(locale), { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

export function fmtDayRange(range: { from: string; to: string }, locale: DsLocale): string {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const a = fmtDay(range.from, locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const b = fmtDay(range.to, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

export function fmtDateTime(iso: string, locale: DsLocale): string {
  return new Intl.DateTimeFormat(tagOf(locale), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
}

// ───────────────────────────── CSV ─────────────────────────────

function cell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  // Formül enjeksiyonuna karşı (=, +, -, @ ile başlayan metin).
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Excel TR uyumlu: `;` ayırıcı + BOM. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}`;
}

export function downloadCsv(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
