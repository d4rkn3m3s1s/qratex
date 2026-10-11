'use client';

import type {
  CouncilConfig,
  CouncilSettingsPayload,
  CreateSessionInput,
  DealerOption,
  PublishInput,
  PublishResult,
  SessionDetail,
  SessionPage,
} from '@/lib/council/contract';

/** Zarf v2 hatası — QueryState (`status`/`code`) ve formlar aynı nesneyi okur. */
export class CouncilApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'CouncilApiError';
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
    throw new CouncilApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz (ör. platform zaman aşımı) */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    const fallback = res.status === 504 ? 'Sunucu zamanında yanıt vermedi. Adımı yeniden deneyin.' : 'İstek tamamlanamadı.';
    throw new CouncilApiError(res.status || 500, env.error || fallback, env.code ?? null, env.details);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function idemKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

const BASE = '/api/admin/council';
const enc = encodeURIComponent;

export const councilKeys = {
  all: ['admin-council'] as const,
  session: (id: string) => ['admin-council', 'session', id] as const,
  sessions: (qs: string) => ['admin-council', 'sessions', qs] as const,
  recent: () => ['admin-council', 'sessions', 'recent'] as const,
  settings: () => ['admin-council', 'settings'] as const,
  dealers: (q: string) => ['admin-council', 'dealers', q] as const,
};

export const fetchSession = (id: string) => call<SessionDetail>(`${BASE}/sessions/${enc(id)}`);
export const fetchSessions = (qs: string) => call<SessionPage>(`${BASE}/sessions?${qs}`);
export const createSession = (body: CreateSessionInput) =>
  call<SessionDetail>(`${BASE}/sessions`, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });
export const stepSession = (id: string, signal?: AbortSignal) =>
  call<SessionDetail>(`${BASE}/sessions/${enc(id)}/step`, { method: 'POST', signal });
export const sessionAction = (id: string, action: 'cancel' | 'archive' | 'unarchive') =>
  call<SessionDetail>(`${BASE}/sessions/${enc(id)}`, { method: 'PATCH', body: JSON.stringify({ action }) });
export const publishActions = (id: string, body: PublishInput) =>
  call<PublishResult>(`${BASE}/sessions/${enc(id)}/publish`, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });
export const fetchSettings = () => call<CouncilSettingsPayload>(`${BASE}/config`);
export const saveSettings = (config: CouncilConfig, expectedUpdatedAt: string | null) =>
  call<CouncilSettingsPayload>(`${BASE}/config`, { method: 'PUT', body: JSON.stringify({ config, expectedUpdatedAt }) });
export const searchDealers = (q: string, signal?: AbortSignal) =>
  call<{ items: DealerOption[] }>(`${BASE}/dealers?q=${enc(q)}`, { signal }).then((r) => r.items);
