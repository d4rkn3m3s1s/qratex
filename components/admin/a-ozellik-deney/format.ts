/** Özellik ve Deney Kontrolü biçimleyicileri — saat dilimi her zaman Europe/Istanbul, sayılar tr-TR. */
import type { Tone } from '@/components/states';
import type { Enforcement, ExperimentStatus, ModuleSeverity } from '@/lib/admin-flags/contract';

const TZ = 'Europe/Istanbul';
const absFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
const dayFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' });
const numFmt = new Intl.NumberFormat('tr-TR');
const pctFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

export const fmtNum = (n: number) => numFmt.format(n);
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `%${pctFmt.format(n)}`);
export const fmtSignedPp = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${pctFmt.format(Math.abs(n))} puan`;
export const fmtSignedPct = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}%${pctFmt.format(Math.abs(n))}`;
export const fmtP = (p: number | null | undefined) => (p === null || p === undefined ? '—' : p < 0.001 ? 'p < 0,001' : `p = ${p.toFixed(3).replace('.', ',')}`);
export const fmtAbs = (iso: string | null | undefined) => (iso ? absFmt.format(new Date(iso)) : '—');
export const fmtDay = (ymd: string) => dayFmt.format(new Date(`${ymd}T12:00:00+03:00`));

export function fmtRel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return 'az önce';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return absFmt.format(new Date(iso));
}

/** Gün sayısı (başlangıçtan bugüne / bitişe). */
export function daysBetween(fromIso: string | null, toIso?: string | null): number | null {
  if (!fromIso) return null;
  const end = toIso ? new Date(toIso).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(fromIso).getTime()) / 86_400_000));
}

export const ENFORCEMENT_TONE: Record<Enforcement, Tone> = {
  api: 'success',
  page: 'success',
  server: 'info',
  landing: 'info',
  menu: 'warning',
  none: 'danger',
};

export const SEVERITY_TONE: Record<ModuleSeverity, Tone> = { critical: 'danger', important: 'warning', optional: 'neutral' };

export const STATUS_TONE: Record<ExperimentStatus, Tone> = { draft: 'neutral', running: 'success', paused: 'warning', completed: 'info' };

/** Türkçe duyarlı arama normalizasyonu ("İ"/"I" doğru eşleşir). */
export const norm = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '');
