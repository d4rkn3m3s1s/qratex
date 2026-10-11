import type { ActorRef } from '@/lib/ai-studio/contract';

const NUM = new Intl.NumberFormat('tr-TR');
const DATE_TIME = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : NUM.format(n));
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
  return fmtDateTime(iso);
}

export function actorName(a: ActorRef | null | undefined): string {
  if (!a) return 'Sistem';
  return a.name || a.email || 'Bilinmeyen yönetici';
}

export function percent(part: number, total: number): string {
  if (!total) return '—';
  return `%${Math.round((part / total) * 100)}`;
}
