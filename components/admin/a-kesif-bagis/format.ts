import { Archive, CalendarClock, CheckCircle2, CircleOff, Clock3, Hourglass, Radio } from 'lucide-react';
import { defineStatusMap } from '@/components/ds/data';
import { SPONSOR_STATUS_LABEL, type SponsorStatus } from '@/lib/admin-discovery/contract';
import { PROJECT_STATUS_LABEL, type ProjectStatus } from '@/lib/admin-donations/contract';

const NUM = new Intl.NumberFormat('tr-TR');
const DEC = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : NUM.format(n));
export const fmtDecimal = (n: number | null | undefined) => (n == null ? '—' : DEC.format(n));
export const fmtDate = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? DATE_TIME.format(new Date(iso)) : '—');

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

export const SPONSOR_STATUS = defineStatusMap<SponsorStatus>({
  live: { label: SPONSOR_STATUS_LABEL.live, tone: 'success', icon: Radio },
  scheduled: { label: SPONSOR_STATUS_LABEL.scheduled, tone: 'info', icon: CalendarClock },
  ended: { label: SPONSOR_STATUS_LABEL.ended, tone: 'neutral', icon: Hourglass },
  off: { label: SPONSOR_STATUS_LABEL.off, tone: 'warning', icon: CircleOff },
});

export const PROJECT_STATUS = defineStatusMap<ProjectStatus>({
  live: { label: PROJECT_STATUS_LABEL.live, tone: 'success', icon: CheckCircle2 },
  scheduled: { label: PROJECT_STATUS_LABEL.scheduled, tone: 'info', icon: CalendarClock },
  ended: { label: PROJECT_STATUS_LABEL.ended, tone: 'neutral', icon: Clock3 },
  inactive: { label: PROJECT_STATUS_LABEL.inactive, tone: 'warning', icon: CircleOff },
  archived: { label: PROJECT_STATUS_LABEL.archived, tone: 'neutral', icon: Archive },
});
