'use client';

import type {
  PlanHistoryItem,
  PlanInput,
  PlanSummary,
  PricingOverview,
  StripeCheck,
  StripeVerifyBody,
  UpdatePlanBody,
} from '@/lib/admin-pricing/contract';

/**
 * Zarf v2 hatası. `status`/`code`/`details` alanları `applyServerErrors` (ds/form) ve
 * QueryState tarafından okunur — alan hataları alana, 409 çakışma bandına gider.
 */
export class PricingApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'PricingApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string; details?: unknown };

function newKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${performance.now().toString(36).replace('.', '')}`;
  }
}

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      body,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new PricingApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (parsed && typeof parsed === 'object' ? parsed : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new PricingApiError(res.status, env.error || env.message || `İstek başarısız (${res.status}).`, env.code ?? null, env.details);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Beklenmeyen bir hata oluştu.');

const BASE = '/api/admin/pricing';
const enc = encodeURIComponent;

export const pricingKeys = {
  all: ['admin-pricing'] as const,
  overview: () => ['admin-pricing', 'overview'] as const,
  history: (id: string) => ['admin-pricing', 'history', id] as const,
};

export const fetchOverview = (signal?: AbortSignal) => call<PricingOverview>(`${BASE}/console`, { signal });
export const fetchHistory = (id: string, signal?: AbortSignal) => call<{ items: PlanHistoryItem[] }>(`${BASE}/plans/${enc(id)}/history`, { signal });

export const createPlan = (input: PlanInput) =>
  call<{ plan: PlanSummary }>(`${BASE}/plans`, { method: 'POST', json: input, headers: { 'Idempotency-Key': newKey() } });
export const updatePlan = (id: string, body: UpdatePlanBody) =>
  call<{ plan: PlanSummary; changed: string[] }>(`${BASE}/plans/${enc(id)}`, { method: 'PATCH', json: body });

export type ArchiveImpact = { planId: string; planName: string; subscribers: number; paying: number };
export const previewArchive = (id: string) =>
  call<{ archived: boolean; impact: ArchiveImpact }>(`${BASE}/plans/${enc(id)}/archive`, { method: 'POST', json: { dryRun: true } });
export const archivePlan = (id: string) =>
  call<{ archived: boolean; impact: ArchiveImpact }>(`${BASE}/plans/${enc(id)}/archive`, { method: 'POST', json: { confirm: true } });
export const restorePlan = (id: string) => call<{ plan: PlanSummary }>(`${BASE}/plans/${enc(id)}/restore`, { method: 'POST' });
export const reorderPlans = (ids: string[]) => call<{ ids: string[] }>(`${BASE}/reorder`, { method: 'PUT', json: { ids } });

export const verifyStripe = (body: StripeVerifyBody) => call<{ items: StripeCheck[] }>(`${BASE}/stripe`, { method: 'POST', json: body });
export const createStripePrice = (planId: string, expectedUpdatedAt: string) =>
  call<{ plan: PlanSummary; check: StripeCheck }>(`${BASE}/stripe/create-price`, { method: 'POST', json: { planId, expectedUpdatedAt } });
