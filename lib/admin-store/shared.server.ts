/** Mağaza ve Ödüller — sunucu ortak yardımcıları (gün serisi, denetim satırı, sayfalama). */
import type { AuditRow, DayPoint, Paged } from './contract';

export const DAY_MS = 86_400_000;
const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function istanbulDay(d: Date): string {
  return ISTANBUL_DAY.format(d);
}

/** Son `days` İstanbul günü için sıfırla doldurulmuş seri (eski → yeni). */
export function daySeries(dates: Date[], now: Date, days = 30): DayPoint[] {
  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) byDay.set(istanbulDay(new Date(now.getTime() - i * DAY_MS)), 0);
  for (const d of dates) {
    const k = istanbulDay(d);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  return [...byDay.entries()].map(([day, count]) => ({ day, count }));
}

export function paginate<T>(rows: T[], page: number, size: number): Paged<T> {
  const start = (page - 1) * size;
  return { items: rows.slice(start, start + size), total: rows.length, page, size };
}

/** Türkçe duyarlı arama eşleşmesi (İ/ı). */
export function trIncludes(hay: string | null | undefined, needle: string): boolean {
  if (!hay) return false;
  return hay.toLocaleLowerCase('tr-TR').includes(needle.toLocaleLowerCase('tr-TR'));
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

type AuditLike = {
  id: string;
  action: string;
  createdAt: Date;
  oldData: unknown;
  newData: unknown;
  actorSnapshot?: unknown;
  user?: { name: string | null; email: string | null } | null;
};

/** Ham denetim kaydı → okunur satır (eski/yeni alan farkı). */
export function toAuditRow(row: AuditLike, labels: Record<string, string>): AuditRow {
  const snap = asRecord(row.actorSnapshot);
  const actor = row.user?.name || row.user?.email || (typeof snap?.email === 'string' ? snap.email : null);
  const oldD = asRecord(row.oldData) ?? {};
  const newD = asRecord(row.newData) ?? {};
  const explicit = Array.isArray(newD.changes) ? (newD.changes as AuditRow['changes']) : null;
  const changes: AuditRow['changes'] = explicit
    ? explicit.filter((c) => c && typeof c.field === 'string')
    : Object.keys({ ...oldD, ...newD })
        .filter((k) => !['updatedAt', 'createdAt', 'id', 'metadata'].includes(k))
        .filter((k) => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
        .slice(0, 12)
        .map((k) => ({ field: k, from: oldD[k] ?? null, to: newD[k] ?? null }));
  return {
    id: row.id,
    action: row.action,
    label: labels[row.action] ?? row.action,
    at: row.createdAt.toISOString(),
    actor: actor ?? null,
    changes,
  };
}

/** Alan bazında fark (denetim kaydı ve iyimser kilit için). */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, keys: readonly string[]) {
  return keys
    .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map((k) => ({ field: k, from: before[k] ?? null, to: after[k] ?? null }));
}
