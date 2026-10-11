'use client';

import type {
  ApiKeyCreated,
  ApiKeyDetail,
  ApiKeyItem,
  CreateKeyInput,
  CreatePartnerInput,
  CreateWebhookInput,
  DealerOption,
  DeliveryPage,
  DeliveryResult,
  IntegrationsOverview,
  Paged,
  PartnerDetail,
  PartnerItem,
  UpdateKeyInput,
  UpdatePartnerInput,
  UpdateWebhookInput,
  WebhookCreated,
  WebhookDetail,
  WebhookItem,
} from '@/lib/integrations/contract';
import type { CatalogPayload } from '@/lib/integrations/catalog';

/** Zarf v2 hatası — QueryState (`status`/`code`) ve formlar aynı nesneyi okur. */
export class IntegrationsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(status: number, message: string, code: string | null, details: unknown) {
    super(message);
    this.name = 'IntegrationsApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string; details?: unknown };

async function call<T>(url: string, init?: RequestInit & { idempotent?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  if (init?.idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new IntegrationsApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK', null);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz ya da HTML (ör. kapı yönlendirmesi) */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    const fallback = res.status === 401 ? 'Oturumunuz sona erdi; yeniden giriş yapın.' : `İstek başarısız (${res.status}).`;
    throw new IntegrationsApiError(res.status, env.error || env.message || fallback, env.code ?? null, env.details ?? null);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');

/** Sunucu doğrulama ayrıntısını alan → mesaj sözlüğüne çevirir. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof IntegrationsApiError) || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path?: string; message?: string }[]) {
    if (d?.path && d.message && !out[d.path.split('.')[0]]) out[d.path.split('.')[0]] = d.message;
  }
  return out;
}

const BASE = '/api/admin/integrations';
const enc = encodeURIComponent;
const json = (v: unknown) => JSON.stringify(v);

export const intKeys = {
  all: ['admin-integrations'] as const,
  overview: () => ['admin-integrations', 'overview'] as const,
  keys: (qs: string) => ['admin-integrations', 'keys', qs] as const,
  key: (id: string) => ['admin-integrations', 'key', id] as const,
  webhooks: (qs: string) => ['admin-integrations', 'webhooks', qs] as const,
  webhook: (id: string) => ['admin-integrations', 'webhook', id] as const,
  deliveries: (webhookId: string, status: string) => ['admin-integrations', 'deliveries', webhookId, status] as const,
  partners: (qs: string) => ['admin-integrations', 'partners', qs] as const,
  partner: (id: string) => ['admin-integrations', 'partner', id] as const,
  dealers: (q: string) => ['admin-integrations', 'dealers', q] as const,
  catalog: () => ['admin-integrations', 'catalog'] as const,
};

export const fetchOverview = (signal?: AbortSignal) => call<IntegrationsOverview>(`${BASE}/overview`, { signal });

export const fetchKeys = (qs: string, signal?: AbortSignal) => call<Paged<ApiKeyItem>>(`${BASE}/keys${qs ? `?${qs}` : ''}`, { signal });
export const fetchKey = (id: string, signal?: AbortSignal) => call<ApiKeyDetail>(`${BASE}/keys/${enc(id)}`, { signal });
export const createKey = (input: CreateKeyInput) => call<ApiKeyCreated>(`${BASE}/keys`, { method: 'POST', body: json(input), idempotent: true });
export const updateKey = (id: string, input: UpdateKeyInput) => call<ApiKeyItem>(`${BASE}/keys/${enc(id)}`, { method: 'PATCH', body: json(input) });
export const revokeKey = (id: string, reason: string) => call<ApiKeyItem>(`${BASE}/keys/${enc(id)}/revoke`, { method: 'POST', body: json({ reason }) });
export const rollKey = (id: string, graceHours: 0 | 1 | 24 | 72) =>
  call<ApiKeyCreated & { previous: ApiKeyItem }>(`${BASE}/keys/${enc(id)}/roll`, { method: 'POST', body: json({ graceHours }), idempotent: true });

export const fetchWebhooks = (qs: string, signal?: AbortSignal) => call<{ items: WebhookItem[] }>(`${BASE}/webhooks${qs ? `?${qs}` : ''}`, { signal });
export const fetchWebhook = (id: string, signal?: AbortSignal) => call<WebhookDetail>(`${BASE}/webhooks/${enc(id)}`, { signal });
export const createWebhook = (input: CreateWebhookInput) => call<WebhookCreated>(`${BASE}/webhooks`, { method: 'POST', body: json(input), idempotent: true });
export const updateWebhook = (id: string, input: UpdateWebhookInput) => call<WebhookItem>(`${BASE}/webhooks/${enc(id)}`, { method: 'PATCH', body: json(input) });
export const rotateSecret = (id: string) => call<WebhookCreated>(`${BASE}/webhooks/${enc(id)}/rotate-secret`, { method: 'POST', idempotent: true });
export const testWebhook = (id: string, event?: string) => call<DeliveryResult>(`${BASE}/webhooks/${enc(id)}/test`, { method: 'POST', body: json(event ? { event } : {}) });
export const fetchDeliveries = (webhookId: string, status: string, cursor: string | null, signal?: AbortSignal) =>
  call<DeliveryPage>(`${BASE}/deliveries?${new URLSearchParams({ ...(webhookId ? { webhookId } : {}), status, size: '20', ...(cursor ? { cursor } : {}) })}`, { signal });
export const resendDelivery = (id: string) => call<DeliveryResult>(`${BASE}/deliveries/${enc(id)}/resend`, { method: 'POST' });

export const fetchPartners = (qs: string, signal?: AbortSignal) => call<{ items: PartnerItem[] }>(`${BASE}/partners${qs ? `?${qs}` : ''}`, { signal });
export const fetchPartner = (id: string, signal?: AbortSignal) => call<PartnerDetail>(`${BASE}/partners/${enc(id)}`, { signal });
export const createPartner = (input: CreatePartnerInput) => call<PartnerItem>(`${BASE}/partners`, { method: 'POST', body: json(input), idempotent: true });
export const updatePartner = (id: string, input: UpdatePartnerInput) =>
  call<{ partner: PartnerItem; webhookSecret: string | null }>(`${BASE}/partners/${enc(id)}`, { method: 'PATCH', body: json(input) });

export const searchDealers = (q: string, signal?: AbortSignal) => call<{ items: DealerOption[] }>(`${BASE}/dealers?${new URLSearchParams({ q })}`, { signal });
export const dealersByIds = (ids: string[], signal?: AbortSignal) =>
  call<{ items: DealerOption[] }>(`${BASE}/dealers?${new URLSearchParams({ ids: ids.join(',') })}`, { signal });

export const fetchCatalog = (signal?: AbortSignal) => call<CatalogPayload>(`${BASE}/catalog`, { signal });

/** Panoya kopyala — başarısızlığı GİZLEMEZ (çağıran metni seçili bırakır). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
