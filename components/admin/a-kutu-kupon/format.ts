import { Archive, CheckCircle2, CircleSlash, Clock, Hourglass, PackageOpen, TimerOff, Undo2 } from 'lucide-react';
import type { StatusMap } from '@/components/ds/data';
import type { CampaignState } from '@/lib/admin-surprise-boxes/contract';
import { STATUS_LABEL, type CouponStatus } from '@/lib/admin-coupons/contract';

export const CAMPAIGN_STATE_MAP: StatusMap<CampaignState> = {
  pending: { label: 'Açılmadı', tone: 'warning', icon: Clock },
  partial: { label: 'Kısmen açıldı', tone: 'info', icon: Hourglass },
  opened: { label: 'Hepsi açıldı', tone: 'success', icon: PackageOpen },
  revoked: { label: 'Geri çekildi', tone: 'neutral', icon: Undo2 },
};

export const COUPON_STATUS_MAP: StatusMap<CouponStatus> = {
  usable: { label: STATUS_LABEL.usable, tone: 'success', icon: CheckCircle2 },
  expired: { label: STATUS_LABEL.expired, tone: 'neutral', icon: TimerOff },
  exhausted: { label: STATUS_LABEL.exhausted, tone: 'warning', icon: CircleSlash },
  inactive: { label: STATUS_LABEL.inactive, tone: 'neutral', icon: Archive },
};

const nf = new Intl.NumberFormat('tr-TR');
export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

const df = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric' });
const dtf = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const shortDay = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: '2-digit', month: 'short' });
export const fmtDate = (iso: string | null | undefined) => (iso ? df.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dtf.format(new Date(iso)) : '—');
/** "YYYY-MM-DD" (İstanbul gün anahtarı) → "11 Eki". */
export const fmtDayKey = (key: string) => shortDay.format(new Date(`${key}T00:00:00Z`));

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** `datetime-local` (İstanbul duvar saati, UTC+3) ↔ ISO. */
export function wallToIso(wall: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) return null;
  const d = new Date(`${wall}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToWall(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
