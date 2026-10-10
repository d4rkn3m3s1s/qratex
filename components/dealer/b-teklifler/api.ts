'use client';

import type { DealerHappyHourInput, FlashCreateInput, PersonalOfferInput } from '@/lib/dealer/offers/rules';
import type { DealerOffersOverview, PersonalCandidateDto } from '@/lib/dealer/offers/types';

/**
 * Zarf v2 hatası. `QueryState` (`status`/`code` ile sınıflandırır) ve form katmanı
 * (`readServerError`: `details` → alan hataları) aynı nesneyi okur.
 */
export class OffersApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  readonly retryable: boolean;
  constructor(status: number, message: string, code: string | null, details: unknown, retryable: boolean) {
    super(message);
    this.name = 'OffersApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

function idempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

async function offersFetch<T>(url: string, init?: RequestInit & { idempotent?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (init?.idempotent) headers['Idempotency-Key'] = idempotencyKey();
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as {
    ok?: boolean;
    success?: boolean;
    data?: T;
    error?: string;
    code?: string;
    details?: unknown;
    retryable?: boolean;
  };
  if (!res.ok || env.success === false || env.ok === false) {
    throw new OffersApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details, env.retryable === true);
  }
  return env.data as T;
}

export function fetchOffersOverview(signal?: AbortSignal): Promise<DealerOffersOverview> {
  return offersFetch<DealerOffersOverview>('/api/dealer/offers', { signal });
}

export function createFlash(input: FlashCreateInput): Promise<{ id: string; status: string; hasLocation: boolean }> {
  return offersFetch('/api/dealer/offers/flash', { method: 'POST', body: JSON.stringify(input), idempotent: true });
}

export function stopFlash(id: string): Promise<{ id: string; status: 'stopped'; openCount: number }> {
  return offersFetch(`/api/dealer/offers/flash/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'stop' }),
  });
}

export function createHappyHour(input: DealerHappyHourInput): Promise<{ id: string }> {
  return offersFetch('/api/dealer/offers/happy-hours', { method: 'POST', body: JSON.stringify(input), idempotent: true });
}

export function toggleHappyHour(id: string, isActive: boolean): Promise<{ id: string; isActive: boolean }> {
  return offersFetch(`/api/dealer/offers/happy-hours/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

export function searchCandidates(q: string, signal?: AbortSignal): Promise<{ candidates: PersonalCandidateDto[] }> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return offersFetch(`/api/dealer/offers/personal/candidates${qs}`, { signal });
}

export function sendPersonal(input: PersonalOfferInput): Promise<{ offerId: string; status: string }> {
  return offersFetch('/api/dealer/offers/personal', { method: 'POST', body: JSON.stringify(input), idempotent: true });
}
