'use client';

import type {
  BattleActionInput,
  BattleActionResult,
  BattleCreateInput,
  BattleDetail,
  BattleListPage,
  SquadActionInput,
  SquadActionResult,
  SquadAuditPage,
  SquadDetail,
  SquadListPage,
  SquadOption,
  SquadStats,
} from '@/lib/admin-squads/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class SquadsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'SquadsApiError';
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
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new SquadsApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new SquadsApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** Sunucu doğrulama hatasından alan mesajı (`details: [{ path, message }]` ya da zod flatten). */
export function fieldError(err: unknown, path: string): string | undefined {
  if (!(err instanceof SquadsApiError)) return undefined;
  const d = err.details;
  if (Array.isArray(d)) {
    const hit = (d as Array<{ path?: unknown; message?: unknown }>).find((x) => typeof x.path === 'string' && (x.path === path || x.path.endsWith(`.${path}`)));
    return typeof hit?.message === 'string' ? hit.message : undefined;
  }
  return undefined;
}

function idemKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

const BASE = '/api/admin/squads';
const enc = encodeURIComponent;

export const squadsKeys = {
  all: ['admin-squads'] as const,
  stats: () => ['admin-squads', 'stats'] as const,
  list: (qs: string) => ['admin-squads', 'list', qs] as const,
  detail: (id: string) => ['admin-squads', 'detail', id] as const,
  battles: (qs: string) => ['admin-squads', 'battles', qs] as const,
  battle: (id: string) => ['admin-squads', 'battle', id] as const,
  options: (q: string) => ['admin-squads', 'options', q] as const,
  audit: (page: number) => ['admin-squads', 'audit', page] as const,
};

export const fetchStats = () => call<SquadStats>(`${BASE}/stats`);
export const fetchSquads = (qs: string, signal?: AbortSignal) => call<SquadListPage>(`${BASE}?${qs}`, { signal });
export const fetchSquad = (id: string) => call<SquadDetail>(`${BASE}/${enc(id)}`);
export const fetchBattles = (qs: string, signal?: AbortSignal) => call<BattleListPage>(`${BASE}/battles?${qs}`, { signal });
export const fetchBattle = (id: string) => call<BattleDetail>(`${BASE}/battles/${enc(id)}`);
export const fetchOptions = (q: string, signal?: AbortSignal) =>
  call<{ items: SquadOption[] }>(`${BASE}/options${q ? `?q=${enc(q)}` : ''}`, { signal }).then((r) => r.items);
export const fetchAudit = (page: number) => call<SquadAuditPage>(`${BASE}/audit?page=${page}&size=25`);

export const squadAction = (id: string, body: SquadActionInput) =>
  call<SquadActionResult>(`${BASE}/${enc(id)}/actions`, { method: 'POST', body: JSON.stringify(body) });
export const createBattle = (body: BattleCreateInput) =>
  call<{ id: string; status: 'pending' | 'active' }>(`${BASE}/battles`, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });
export const battleAction = (id: string, body: BattleActionInput) =>
  call<BattleActionResult>(`${BASE}/battles/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
