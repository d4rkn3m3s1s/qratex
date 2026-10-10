'use client';

/**
 * Klan uçları için istemci yardımcıları — zarf v2 (`{ ok, data, code, error }`) okur;
 * hata kodu korunur ki arayüz yerel metne çevirebilsin (squadErrorText).
 */
import type { BattleHistoryPage, BattleState, SquadOverview, SquadSearchResult } from '@/lib/squads/dto';

export class SquadApiError extends Error {
  readonly code: string | undefined;
  readonly status: number;
  constructor(message: string, code: string | undefined, status: number) {
    super(message);
    this.name = 'SquadApiError';
    this.code = code;
    this.status = status;
  }
}

export const squadKeys = {
  overview: ['squads', 'overview'] as const,
  battle: ['squads', 'battle'] as const,
  history: ['squads', 'history'] as const,
  search: (q: string) => ['squads', 'search', q] as const,
  name: (n: string, except?: string) => ['squads', 'name', n, except ?? ''] as const,
};

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; code?: string; error?: string; message?: string };

export async function squadFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      ...rest,
      headers: {
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(headers ?? {}),
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    throw new SquadApiError('Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.', 'NETWORK', 0);
  }
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success === false || body.ok === false) {
    const message = body?.error || body?.message || 'Beklenmeyen bir hata oluştu. Lütfen tekrar dene.';
    throw new SquadApiError(message, body?.code, res.status);
  }
  return body.data as T;
}

export const squadApi = {
  overview: () => squadFetch<SquadOverview>('/api/customer/squads/overview'),
  battle: () => squadFetch<BattleState & { isOwner: boolean }>('/api/customer/squads/battles/current'),
  history: (cursor: string | null) =>
    squadFetch<BattleHistoryPage>(`/api/customer/squads/battles${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  search: (q: string) =>
    squadFetch<{ items: SquadSearchResult[] }>(`/api/customer/squads/search?q=${encodeURIComponent(q)}`),
  nameCheck: (name: string, exceptSquadId?: string) =>
    squadFetch<{ available: boolean; reason: string | null }>(
      `/api/customer/squads/name-check?name=${encodeURIComponent(name)}${exceptSquadId ? `&exceptSquadId=${encodeURIComponent(exceptSquadId)}` : ''}`
    ),
  create: (input: { name: string; description?: string }) =>
    squadFetch<{ squad: { id: string; name: string; inviteCode: string } }>('/api/customer/squads', { method: 'POST', json: input }),
  join: (inviteCode: string) =>
    squadFetch<{ squadId: string; name: string }>('/api/customer/squads/join', { method: 'POST', json: { inviteCode } }),
  leave: (squadId: string) =>
    squadFetch<{ result: string; message: string }>(`/api/customer/squads/${encodeURIComponent(squadId)}/leave`, { method: 'POST' }),
  update: (squadId: string, patch: { name?: string; description?: string | null; goalTier?: 1 | 2 | 3 }) =>
    squadFetch<{ name: string; description: string | null; goalTier: 1 | 2 | 3 }>(
      `/api/customer/squads/${encodeURIComponent(squadId)}`,
      { method: 'PATCH', json: patch }
    ),
  transfer: (squadId: string, userId: string) =>
    squadFetch<{ name: string }>(`/api/customer/squads/${encodeURIComponent(squadId)}/transfer`, { method: 'POST', json: { userId } }),
  kick: (squadId: string, userId: string) =>
    squadFetch<{ name: string }>(
      `/api/customer/squads/${encodeURIComponent(squadId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    ),
  rotateCode: (squadId: string) =>
    squadFetch<{ inviteCode: string }>(`/api/customer/squads/${encodeURIComponent(squadId)}/invite-code`, { method: 'POST' }),
  claimGoal: () => squadFetch<{ reward: number; credited: number }>('/api/customer/squads/weekly-goal/claim', { method: 'POST' }),
  challenge: (input: { targetSquadId: string; durationHours: number; rewardPool: number }, idempotencyKey: string) =>
    squadFetch<{ battleId: string }>('/api/customer/squads/challenge', {
      method: 'POST',
      json: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  respond: (battleId: string, action: 'accept' | 'reject') =>
    squadFetch<{ status: string; refunded?: number }>(`/api/customer/squads/battles/${encodeURIComponent(battleId)}/respond`, {
      method: 'PATCH',
      json: { action },
    }),
  withdraw: (battleId: string) =>
    squadFetch<{ refunded: number }>(`/api/customer/squads/battles/${encodeURIComponent(battleId)}/withdraw`, { method: 'POST' }),
};

/** Tarayıcı UUID'si (Idempotency-Key). */
export function newIdempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
  }
}
