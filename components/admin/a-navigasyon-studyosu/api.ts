'use client';

import type { NavHistoryPage, NavPutBody, NavStudioState } from '@/lib/admin-navigation/contract';
import { clientMessage, requestFailedStatus } from '@/lib/client-messages';

/** Navigasyon Stüdyosu istemci katmanı (zarf v2). Hata `status/code/details` taşır. */
export class NavApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'NavApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string; details?: unknown };

async function call<T>(url: string, init?: { method?: string; json?: unknown; signal?: AbortSignal }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, { method: init?.method ?? 'GET', cache: 'no-store', credentials: 'same-origin', body, headers, signal: init?.signal });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new NavApiError(0, clientMessage('network'), 'NETWORK');
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* gövdesiz yanıt */
  }
  const env = (parsed && typeof parsed === 'object' ? parsed : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new NavApiError(res.status, env.error || env.message || requestFailedStatus(res.status), env.code ?? null, env.details);
  }
  return env.data as T;
}

export const navKeys = {
  state: ['admin-navigation', 'state'] as const,
  history: ['admin-navigation', 'history'] as const,
};

export const fetchNavigation = (signal?: AbortSignal) => call<{ state: NavStudioState }>('/api/admin/navigation', { signal });
export const saveNavigation = (body: NavPutBody) => call<{ state: NavStudioState }>('/api/admin/navigation', { method: 'PUT', json: body });
export const fetchNavHistory = (cursor: string | undefined, signal?: AbortSignal) =>
  call<NavHistoryPage>(`/api/admin/navigation/history?limit=15${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : clientMessage('unexpected'));
