import { Archive, KeyRound, Download, Coins, PlusCircle, Pencil, Undo2, CircleDot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Severity } from '@/components/ds/data';
import type { AuditCategory, AuditSeverity } from '@/lib/admin-audit/catalog';

const NUM = new Intl.NumberFormat('tr-TR');
const DATE_TIME = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const FULL = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'full', timeStyle: 'medium' });
const DAY = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const fmtNumber = (n: number | null | undefined) => (n == null ? '—' : NUM.format(n));
export const fmtDateTime = (iso: string | null | undefined) => (iso ? DATE_TIME.format(new Date(iso)) : '—');
export const fmtFull = (iso: string) => `${FULL.format(new Date(iso))} (İstanbul)`;
export const fmtDay = (iso: string) => DAY.format(new Date(iso));
export const fmtTime = (iso: string) => TIME.format(new Date(iso));

export function fmtAgo(iso: string, now: number = Date.now()): string {
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

/** Katalog önemi → QDL önem rozeti. */
export const SEVERITY_TO_DS: Record<AuditSeverity, Severity> = { critical: 'critical', high: 'high', normal: 'info' };

export const CATEGORY_ICON: Record<AuditCategory, LucideIcon> = {
  rollback: Undo2,
  delete: Archive,
  security: KeyRound,
  access: Download,
  economy: Coins,
  create: PlusCircle,
  update: Pencil,
  other: CircleDot,
};
