'use client';

import type {
  BatchPage,
  BulkBody,
  BulkResult,
  CardDetail,
  CardListPage,
  CardStats,
  CustomerOption,
  GenerateBody,
  GenerateResult,
} from '@/lib/admin-cards/contract';
import type { DeletionImpact } from '@/lib/data-safety/archive';

/** Zarf v1/v2 hatası — `QueryState` (`status`/`code`) aynı nesneyi okur. */
export class CardsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'CardsApiError';
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
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new CardsApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new CardsApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

const post = <T>(url: string, body: unknown, headers?: Record<string, string>) => call<T>(url, { method: 'POST', body: JSON.stringify(body), headers });

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function idempotencyKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

const BASE = '/api/admin/cards';
const c = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const cardsKeys = {
  all: ['admin-cards'] as const,
  stats: () => ['admin-cards', 'stats'] as const,
  list: (qs: string) => ['admin-cards', 'list', qs] as const,
  detail: (id: string) => ['admin-cards', 'detail', id] as const,
  batches: (qs: string) => ['admin-cards', 'batches', qs] as const,
  batchOptions: () => ['admin-cards', 'batch-options'] as const,
  customers: (q: string) => ['admin-cards', 'customers', q] as const,
};

export const fetchStats = () => call<CardStats>(`${BASE}/stats`);
export const fetchList = (qs: string, signal?: AbortSignal) => call<CardListPage>(`${BASE}/list?${qs}`, { signal });
export const fetchDetail = (id: string) => call<CardDetail>(`${c(id)}/detail`);
export const fetchBatches = (qs: string, signal?: AbortSignal) => call<BatchPage>(`${BASE}/batches?${qs}`, { signal });
export const fetchBatchOptions = () => call<{ items: Array<{ id: string; name: string }> }>(`${BASE}/batches?options=1`);
export const fetchCustomers = (q: string, signal?: AbortSignal) =>
  call<{ items: CustomerOption[] }>(`${BASE}/customers?q=${encodeURIComponent(q)}`, { signal });

export const generateCards = (body: GenerateBody) => post<GenerateResult>(`${BASE}/generate`, body, { 'Idempotency-Key': idempotencyKey() });
export const bulkCards = (body: BulkBody) => post<BulkResult>(`${BASE}/bulk`, body);
export const assignCard = (id: string, customerId: string) => post<{ card: unknown }>(`${c(id)}/assign`, { customerId });
export const unassignCard = (id: string) => post<{ card: unknown }>(`${c(id)}/unassign`, {});

/** Arşiv önizlemesi (mevcut DELETE ucunun `dryRun` sözleşmesi). */
export const previewArchive = async (id: string) => {
  const r = await call<{ impact?: DeletionImpact } & Record<string, unknown>>(`${c(id)}?dryRun=1`, { method: 'DELETE' });
  return r.impact ?? ((r as { data?: { impact?: DeletionImpact } }).data?.impact ?? null);
};
export const archiveCard = (id: string) => call<{ archived: boolean }>(`${c(id)}?confirm=archive`, { method: 'DELETE' });

export const exportHref = (qs: string) => `${BASE}/export${qs ? `?${qs}` : ''}`;
export const printHref = (batchId: string) => `${BASE}/print?batch=${encodeURIComponent(batchId)}`;
