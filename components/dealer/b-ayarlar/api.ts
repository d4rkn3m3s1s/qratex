'use client';

import type {
  AccountPatch,
  AiPatch,
  AiSection,
  AiSettingsView,
  BusinessPatch,
  DealerSettingsSnapshot,
} from '@/lib/dealer-settings/contract';
import type { BillingDetails, BillingSummary, CheckoutReturnState } from '@/lib/dealer-settings/billing.server';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve form katmanı (`details`) aynı nesneyi okur. */
export class SettingsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  readonly retryable: boolean;
  constructor(status: number, message: string, code: string | null, details: unknown, retryable: boolean) {
    super(message);
    this.name = 'SettingsApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown; retryable?: boolean };

async function readEnvelope<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T> & Record<string, unknown>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new SettingsApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details, env.retryable === true);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch {
    throw new SettingsApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK', undefined, true);
  }
  return readEnvelope<T>(res);
}

const BASE = '/api/dealer/settings';

export { SETTINGS_KEY, BILLING_KEY, BILLING_DETAILS_KEY } from './keys';

export const fetchSettings = (signal?: AbortSignal) => call<DealerSettingsSnapshot>(BASE, { signal });
export const fetchAi = () => call<AiSection>(`${BASE}/ai`);

export const patchBusiness = (body: BusinessPatch) =>
  call<{ version: string; changed: string[] }>(`${BASE}/business`, { method: 'PATCH', body: JSON.stringify(body) });

export const patchAccount = (body: AccountPatch) =>
  call<{ version: string; changed: string[]; name: string; image: string | null; preferredLanguage: 'tr' | 'en' }>(`${BASE}/account`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const patchAi = (body: AiPatch) => call<AiSettingsView>(`${BASE}/ai`, { method: 'PATCH', body: JSON.stringify(body) });
export const retrainAi = () => call<AiSection>(`${BASE}/ai/retrain`, { method: 'POST' });

export async function uploadLogo(file: File): Promise<{ logo: string }> {
  const form = new FormData();
  form.append('photo', file);
  let res: Response;
  try {
    res = await fetch(`${BASE}/business/logo`, { method: 'POST', body: form, credentials: 'same-origin' });
  } catch {
    throw new SettingsApiError(0, 'Bağlantı kurulamadı.', 'NETWORK', undefined, true);
  }
  return readEnvelope(res);
}
export const removeLogo = () => call<{ logo: null }>(`${BASE}/business/logo`, { method: 'DELETE' });

export const revokeSessions = (scope: 'others' | 'all') =>
  call<{ scope: string; revokedAt: string; reissued: boolean }>(`${BASE}/sessions`, { method: 'POST', body: JSON.stringify({ scope }) });

export const removePushDevice = (id: string) => call<{ id: string }>(`${BASE}/push-devices/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const reverseGeocode = (lat: number, lng: number, lang: 'tr' | 'en') =>
  call<{ displayName: string; compactAddress: string }>(`/api/location/reverse?lat=${lat}&lng=${lng}&lang=${lang}`);

/** Eski (zarf v1) uçlar: `{ success, error }` ya da `{ error }`. */
export async function callLegacy<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  return call<T>(url, init);
}

// ───────────────────────────── Abonelik ─────────────────────────────

export const fetchBilling = () => call<BillingSummary>('/api/dealer/billing');
export const fetchBillingDetails = () => call<BillingDetails>('/api/dealer/billing/details');
export const startCheckout = (planId: string) =>
  call<{ url?: string }>('/api/dealer/billing/checkout', { method: 'POST', body: JSON.stringify({ planId }) });
export const openPortal = () => call<{ url?: string }>('/api/dealer/billing/portal', { method: 'POST' });

export interface PlanChangePreviewDto {
  planId: string;
  planName: string;
  prorationAmount: number;
  nextPeriodAmount: number;
  currency: string;
  prorationDate: number;
  currentPeriodEnd: string | null;
}
export const previewPlanChange = (planId: string) =>
  call<PlanChangePreviewDto>('/api/dealer/billing/change-plan/preview', { method: 'POST', body: JSON.stringify({ planId }) });
export const applyPlanChange = (planId: string, prorationDate: number) =>
  call<{ planId: string; status: string }>('/api/dealer/billing/change-plan', {
    method: 'POST',
    body: JSON.stringify({ planId, prorationDate }),
  });
export const checkoutStatus = (sessionId: string) =>
  call<{ state: CheckoutReturnState; planId: string | null }>(`/api/dealer/billing/checkout/status?session_id=${encodeURIComponent(sessionId)}`);

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof SettingsApiError) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
