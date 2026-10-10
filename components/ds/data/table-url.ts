/**
 * Tablo durumunun URL biçimi — saf (Jest ile test edilir).
 *   ?page=2&size=50&sort=createdAt.desc,name.asc
 * `page` 1 tabanlıdır (insan okur), TanStack `pageIndex` 0 tabanlıdır.
 */

export type SortItem = { id: string; desc: boolean };

const SORT_ID = /^[A-Za-z0-9_.:-]+$/;

export function parseSort(raw: string | null | undefined, allowed?: readonly string[]): SortItem[] {
  if (!raw) return [];
  const out: SortItem[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const dot = trimmed.lastIndexOf('.');
    const id = dot > 0 ? trimmed.slice(0, dot) : trimmed;
    const dir = dot > 0 ? trimmed.slice(dot + 1).toLowerCase() : 'asc';
    if (!SORT_ID.test(id) || (dir !== 'asc' && dir !== 'desc')) continue;
    if (allowed && !allowed.includes(id)) continue;
    if (out.some((s) => s.id === id)) continue;
    out.push({ id, desc: dir === 'desc' });
  }
  return out;
}

export function serializeSort(sort: readonly SortItem[]): string | null {
  if (!sort.length) return null;
  return sort.map((s) => `${s.id}.${s.desc ? 'desc' : 'asc'}`).join(',');
}

export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function parsePageSize(raw: string | null | undefined, options: readonly number[], fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && options.includes(n) ? n : fallback;
}

/** Toplam satırdan sayfa sayısı (en az 1). */
export function pageCountFor(rowCount: number, pageSize: number): number {
  if (!Number.isFinite(rowCount) || rowCount <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

/** "21–40 / 245" için 1 tabanlı aralık. */
export function pageRange(pageIndex: number, pageSize: number, rowCount: number): { from: number; to: number } {
  if (rowCount <= 0) return { from: 0, to: 0 };
  const from = pageIndex * pageSize + 1;
  return { from: Math.min(from, rowCount), to: Math.min(rowCount, from + pageSize - 1) };
}
