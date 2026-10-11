'use client';

import type { BulkInput, GameDetail, GamesOverview, TournamentOverview } from '@/lib/admin-games/contract';
import { clientMessage } from '@/lib/client-messages';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class GamesApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'GamesApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers });
  } catch {
    throw new GamesApiError(0, clientMessage('network'), 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new GamesApiError(res.status || 500, env.error || clientMessage('requestFailed'), env.code ?? null, env.details);
  }
  return env.data as T;
}

export const gamesKeys = {
  all: ['admin-games'] as const,
  overview: () => ['admin-games', 'overview'] as const,
  detail: (gameType: string) => ['admin-games', 'detail', gameType] as const,
  tournament: () => ['admin-games', 'tournament'] as const,
};

export const fetchOverview = () => call<GamesOverview>('/api/admin/games');
export const fetchDetail = (gameType: string) => call<GameDetail>(`/api/admin/games/${encodeURIComponent(gameType)}`);
export const fetchTournament = () => call<TournamentOverview>('/api/admin/games/tournament');

export const patchGame = (body: Record<string, unknown>) =>
  call<{ gameType: string; updatedAt: string | null }>('/api/admin/games', { method: 'PATCH', body: JSON.stringify(body) });

export const resetGame = (gameType: string) =>
  call<{ gameType: string; changed: boolean }>(`/api/admin/games?gameType=${encodeURIComponent(gameType)}`, { method: 'DELETE' });

export const bulkGames = (body: BulkInput) =>
  call<{ changed: string[]; skipped: number }>('/api/admin/games/bulk', { method: 'POST', body: JSON.stringify(body) });

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : clientMessage('failed');
}

export const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('tr-TR'));

const dtf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (iso: string) => dtf.format(new Date(iso));
const df = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: '2-digit', month: 'short' });
/** `YYYY-MM-DD` (İstanbul günü) → "08 Eki". */
export const fmtDay = (day: string) => df.format(new Date(`${day}T00:00:00Z`));
