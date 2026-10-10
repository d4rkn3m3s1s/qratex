'use client';

import type {
  ActionAudience,
  ActionHistoryItem,
  ActionPreview,
  ActionResult,
  ActionSpec,
  CustomerDetail,
  CustomerListPage,
  CustomersSummary,
  InterventionConfigDto,
  RiskOverview,
  SegmentsOverview,
  WinBackOverview,
} from '@/lib/dealer-customers/types';

/** API hatası: `QueryState` `status`/`code` alanlarından türünü (yetkisiz, modül kapalı…) çıkarır. */
export class CustomersApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(message: string, status: number, code: string | null, details?: unknown) {
    super(message);
    this.name = 'CustomersApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new CustomersApiError('Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.', 0, 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const env = (body ?? {}) as { success?: boolean; data?: unknown; error?: string; message?: string; code?: string; details?: unknown };
  if (!res.ok || env.success === false) {
    const msg =
      env.error ||
      env.message ||
      (res.status === 401 ? 'Oturumunuz sona ermiş. Lütfen yeniden giriş yapın.' : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    throw new CustomersApiError(msg, res.status, env.code ?? null, env.details);
  }
  return (env.data ?? body) as T;
}

export type ListParams = {
  q: string;
  segment: string;
  risk: string;
  band: string;
  sort: string | null;
  page: number;
  pageSize: number;
};

export function listQueryString(p: Partial<ListParams>): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set('q', p.q);
  if (p.segment) sp.set('segment', p.segment);
  if (p.risk) sp.set('risk', p.risk);
  if (p.band) sp.set('band', p.band);
  if (p.sort) sp.set('sort', p.sort);
  if (p.page && p.page > 1) sp.set('page', String(p.page));
  if (p.pageSize) sp.set('size', String(p.pageSize));
  return sp.toString();
}

export const customerKeys = {
  all: ['dealer', 'customers'] as const,
  summary: () => ['dealer', 'customers', 'summary'] as const,
  list: (p: ListParams) => ['dealer', 'customers', 'list', p.q, p.segment, p.risk, p.band, p.sort, p.page, p.pageSize] as const,
  detail: (ref: string) => ['dealer', 'customers', 'detail', ref] as const,
  risk: () => ['dealer', 'customers', 'risk'] as const,
  winback: () => ['dealer', 'customers', 'winback'] as const,
  segments: () => ['dealer', 'customers', 'segments'] as const,
  history: () => ['dealer', 'customers', 'history'] as const,
  intervention: (t: number, d: number) => ['dealer', 'customers', 'intervention', t, d] as const,
};

export const fetchSummary = () => fetchJson<CustomersSummary>('/api/dealer/customers/summary');
export const fetchList = (p: ListParams) => fetchJson<CustomerListPage>(`/api/dealer/customers?${listQueryString(p)}`);
export const fetchDetail = (ref: string) => fetchJson<CustomerDetail>(`/api/dealer/customers/${encodeURIComponent(ref)}`);
export const fetchRisk = () => fetchJson<RiskOverview>('/api/dealer/customers/risk');
export const fetchWinBack = () => fetchJson<WinBackOverview>('/api/dealer/customers/winback');
export const fetchSegments = () => fetchJson<SegmentsOverview>('/api/dealer/segment-actions');
export const fetchHistory = () => fetchJson<{ items: ActionHistoryItem[] }>('/api/dealer/customers/actions');

export type InterventionState = {
  config: InterventionConfigDto;
  preview: { thresholdPercent: number; inactiveDays: number; matching: number };
};

export const fetchIntervention = (t?: number, d?: number) => {
  const sp = new URLSearchParams();
  if (t != null) sp.set('thresholdPercent', String(t));
  if (d != null) sp.set('inactiveDays', String(d));
  const qs = sp.toString();
  return fetchJson<InterventionState>(`/api/dealer/churn-intervention${qs ? `?${qs}` : ''}`);
};

export const saveIntervention = (patch: Partial<InterventionConfigDto>) =>
  fetchJson<InterventionState>('/api/dealer/churn-intervention', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

function newKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export const previewCustomerAction = (audience: ActionAudience, action: ActionSpec) =>
  fetchJson<ActionPreview>('/api/dealer/customers/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview', audience, action }),
  });

export const executeCustomerAction = (audience: ActionAudience, action: ActionSpec, idempotencyKey: string = newKey()) =>
  fetchJson<ActionResult>('/api/dealer/customers/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ mode: 'execute', audience, action }),
  });

export { newKey as newIdempotencyKey };

/** Yorum yanıtı (Gelen Kutusu'nun mevcut ucu; QR ve tüketim yorumu ortak). */
export const replyToSignal = (id: string, type: 'feedback' | 'review', reply: string) =>
  fetchJson<unknown>(`/api/dealer/feedbacks/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply, type }),
  });
