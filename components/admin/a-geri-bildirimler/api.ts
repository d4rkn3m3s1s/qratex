'use client';

import type { BulkBody, BulkResult, DealerOption, FeedDetail, FeedPage, FeedStats } from '@/lib/admin-feedbacks/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) aynı nesneyi okur. */
export class FeedbacksApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(status: number, message: string, code: string | null, retryable: boolean) {
    super(message);
    this.name = 'FeedbacksApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new FeedbacksApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK', true);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new FeedbacksApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.retryable === true);
  }
  return env.data as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export const feedbackKeys = {
  all: ['admin-feedbacks'] as const,
  list: (qs: string) => ['admin-feedbacks', 'list', qs] as const,
  stats: (qs: string) => ['admin-feedbacks', 'stats', qs] as const,
  item: (key: string) => ['admin-feedbacks', 'item', key] as const,
  dealers: (q: string) => ['admin-feedbacks', 'dealers', q] as const,
  dealer: (id: string) => ['admin-feedbacks', 'dealer', id] as const,
};

export const fetchFeed = (qs: string, signal?: AbortSignal) => call<FeedPage>(`/api/admin/feedbacks/feed?${qs}`, { signal });
export const fetchStats = (qs: string, signal?: AbortSignal) => call<FeedStats>(`/api/admin/feedbacks/stats?${qs}`, { signal });
export const fetchItem = (key: string, signal?: AbortSignal) =>
  call<FeedDetail>(`/api/admin/feedbacks/item?key=${encodeURIComponent(key)}`, { signal });
export const fetchDealerOptions = (p: { q?: string; id?: string }, signal?: AbortSignal) => {
  const sp = new URLSearchParams();
  if (p.q) sp.set('q', p.q);
  if (p.id) sp.set('id', p.id);
  return call<DealerOption[]>(`/api/admin/feedbacks/dealer-options?${sp}`, { signal });
};
export const runBulk = (body: { action: BulkBody['action']; keys: string[]; reason?: string }) =>
  call<BulkResult>('/api/admin/feedbacks/bulk', { method: 'POST', body: JSON.stringify(body) });
