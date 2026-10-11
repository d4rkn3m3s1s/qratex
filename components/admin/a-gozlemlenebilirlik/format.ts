/** Gözlem ekranları için biçimleyiciler — saat dilimi Europe/Istanbul, Türkçe. */
import type { VitalName } from '@/lib/observability/contract';

const TZ = 'Europe/Istanbul';

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function fmtHour(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = now - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 10) return 'az önce';
  if (s < 60) return `${s} sn önce`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

const nf = new Intl.NumberFormat('tr-TR');
export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

export function fmtMs(ms: number | null | undefined, atLeast = false): string {
  if (ms == null) return '—';
  const pre = atLeast ? '≥ ' : '';
  if (ms >= 1000) return `${pre}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(ms / 1000)} sn`;
  return `${pre}${nf.format(Math.round(ms))} ms`;
}

export function fmtVital(name: VitalName, v: number | null, atLeast = false): string {
  if (v == null) return '—';
  if (name === 'CLS') return `${atLeast ? '≥ ' : ''}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(v)}`;
  return fmtMs(v, atLeast);
}

export const fmtPct = (n: number | null | undefined) =>
  n == null ? '—' : `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n)}`;
