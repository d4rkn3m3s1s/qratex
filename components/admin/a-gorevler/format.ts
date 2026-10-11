import { PauseCircle, CheckCircle2, Archive, TimerOff } from 'lucide-react';
import type { StatusMap } from '@/components/ds/data';
import { STATUS_LABEL, type QuestStatus } from '@/lib/admin-quests/contract';

export const QUEST_STATUS_MAP: StatusMap<QuestStatus> = {
  active: { label: STATUS_LABEL.active, tone: 'success', icon: CheckCircle2 },
  paused: { label: STATUS_LABEL.paused, tone: 'warning', icon: PauseCircle },
  expired: { label: STATUS_LABEL.expired, tone: 'neutral', icon: TimerOff },
  archived: { label: STATUS_LABEL.archived, tone: 'neutral', icon: Archive },
};

const nf = new Intl.NumberFormat('tr-TR');
export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

const df = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric' });
const dtf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso: string | null | undefined) => (iso ? df.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dtf.format(new Date(iso)) : '—');

/** "3 gün kaldı" / "5 saat kaldı" / "Süresi doldu". */
export function fmtRemaining(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'Süresiz';
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'Süresi doldu';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} dk kaldı`;
  if (h < 48) return `${h} saat kaldı`;
  return `${Math.floor(h / 24)} gün kaldı`;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
