import { Archive, CircleOff, CheckCircle2 } from 'lucide-react';
import { defineStatusMap } from '@/components/ds/data';
import type { BadgeStatus } from '@/lib/admin-badges/contract';
import type { Trackability } from '@/lib/badge-trackability';

const NUM = new Intl.NumberFormat('tr-TR');
const DATE = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : NUM.format(n));
export const fmtDate = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? DATE_TIME.format(new Date(iso)) : '—');

/** "3 gün önce" biçimi (yalnız geçmiş). */
export function fmtAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'Hiç';
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} gün önce`;
  return fmtDate(iso);
}

export const BADGE_STATUS = defineStatusMap<BadgeStatus>({
  active: { label: 'Etkin', tone: 'success', icon: CheckCircle2 },
  inactive: { label: 'Pasif', tone: 'warning', icon: CircleOff },
  archived: { label: 'Arşivde', tone: 'neutral', icon: Archive },
});

export const TRACKABILITY_TONE: Record<Trackability, 'success' | 'warning' | 'danger' | 'brand'> = {
  exact: 'success',
  approximate: 'warning',
  untrackable: 'danger',
  character: 'brand',
};
