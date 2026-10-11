import { defineStatusMap } from '@/components/ds/data';
import type { BattleViewStatus } from '@/lib/admin-squads/contract';

const TZ = 'Europe/Istanbul';

const NUM = new Intl.NumberFormat('tr-TR');
export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : NUM.format(n));

const DATE = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const DATETIME = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const DATETIME_Y = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtDate = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : '—');
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? DATETIME.format(d) : DATETIME_Y.format(d);
}

/** "3 sa 20 dk kaldı" / "2 gün önce bitti" — kalan ya da geçen süre. */
export function fmtRemaining(endIso: string, now: number = Date.now()): string {
  const diff = new Date(endIso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const span = d >= 1 ? `${d} gün ${h % 24 ? `${h % 24} sa` : ''}`.trim() : h >= 1 ? `${h} sa ${m % 60 ? `${m % 60} dk` : ''}`.trim() : `${Math.max(1, m)} dk`;
  return diff >= 0 ? `${span} kaldı` : `${span} önce doldu`;
}

export const BATTLE_VIEW = defineStatusMap<BattleViewStatus>({
  live: { label: 'Canlı', tone: 'success' },
  pending: { label: 'Yanıt bekliyor', tone: 'info' },
  overdue: { label: 'Süresi doldu · kapanmadı', tone: 'warning' },
  completed: { label: 'Tamamlandı', tone: 'neutral' },
  cancelled: { label: 'İptal', tone: 'danger' },
});

export const BATTLE_VIEW_TABS: ReadonlyArray<{ value: BattleViewStatus | 'all'; label: string }> = [
  { value: 'live', label: 'Canlı' },
  { value: 'pending', label: 'Bekleyen' },
  { value: 'overdue', label: 'Süresi dolan' },
  { value: 'completed', label: 'Tamamlanan' },
  { value: 'cancelled', label: 'İptal' },
  { value: 'all', label: 'Tümü' },
];

export function displayName(u: { name: string | null; email: string }): string {
  return (u.name ?? '').trim() || u.email;
}
