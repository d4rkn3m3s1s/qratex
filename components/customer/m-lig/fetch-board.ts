import type { LeagueCategory, LeaguePeriod } from '@/lib/league-board/periods';
import type { LeagueBoardDTO } from '@/lib/league-board/types';

export type BoardParams = { category: LeagueCategory; period: LeaguePeriod; page: number };

/** Zarf v2 hatası → `classifyError`'ın tanıdığı biçim (`status`, `code`). */
export class BoardFetchError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  constructor(message: string, status: number, code: string, retryable: boolean) {
    super(message);
    this.name = 'BoardFetchError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function boardQueryKey(p: BoardParams) {
  return ['customer-league', p.category, p.period, p.page] as const;
}

export function boardSearch(p: BoardParams): string {
  const q = new URLSearchParams();
  if (p.category !== 'points') q.set('cat', p.category);
  if (p.period !== 'week') q.set('period', p.period);
  if (p.page > 1) q.set('page', String(p.page));
  return q.toString();
}

export async function fetchBoard(p: BoardParams, signal?: AbortSignal): Promise<LeagueBoardDTO> {
  const q = new URLSearchParams({ category: p.category, period: p.period, page: String(p.page) });
  const res = await fetch(`/api/customer/league?${q.toString()}`, {
    signal,
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  let body: { success?: boolean; data?: LeagueBoardDTO; error?: string; code?: string; retryable?: boolean } = {};
  try {
    body = await res.json();
  } catch {
    /* gövdesiz hata */
  }
  if (!res.ok || body.success !== true || !body.data) {
    throw new BoardFetchError(
      body.error || 'Sıralama yüklenemedi.',
      res.status || 500,
      body.code || (res.status === 403 ? 'FORBIDDEN' : 'INTERNAL'),
      body.retryable !== false
    );
  }
  return body.data;
}
