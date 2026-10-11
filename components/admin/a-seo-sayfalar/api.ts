'use client';

import type { HealthReport, SeoHistoryPage, SeoPayload, SeoState } from '@/lib/admin-seo/contract';
import type { CmsHistoryEntry, CmsListQuery, CmsPageDetail, CmsPageFormParsed, CmsPageList } from '@/lib/cms-pages/contract';

/**
 * SEO Motoru + İçerik sayfaları istemci katmanı (zarf v2). Hata `status/code/details` taşır →
 * QueryState ve ds/form `applyServerErrors` alan hatalarını alana, 409'u çakışma bandına yazar.
 */
export class SurfaceApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'SurfaceApiError';
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

async function call<T>(url: string, init?: Omit<RequestInit, 'body'> & { json?: unknown; idempotent?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  if (init?.idempotent) headers['Idempotency-Key'] = newKey();
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, body, headers });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new SurfaceApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (parsed && typeof parsed === 'object' ? parsed : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new SurfaceApiError(res.status, env.error || env.message || `İstek başarısız (${res.status}).`, env.code ?? null, env.details);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Beklenmeyen bir hata oluştu.');
export const isStatus = (e: unknown, s: number) => e instanceof SurfaceApiError && e.status === s;

// ───────────────────────────── SEO ─────────────────────────────

export const seoKeys = {
  all: ['admin-seo'] as const,
  state: () => ['admin-seo', 'state'] as const,
  history: () => ['admin-seo', 'history'] as const,
};

export type SeoBundle = { state: SeoState; health: HealthReport | null };

export const fetchSeo = (signal?: AbortSignal) => call<SeoBundle>('/api/admin/seo', { signal });
export const saveSeo = (payload: SeoPayload, baseUpdatedAt: string | null, confirmDangerous?: boolean) =>
  call<{ state: SeoState }>('/api/admin/seo', { method: 'PUT', json: { payload, baseUpdatedAt, confirmDangerous } });
export const fetchSeoHistory = (cursor: string | undefined, signal?: AbortSignal) =>
  call<SeoHistoryPage>(`/api/admin/seo/audit?limit=15${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
export const restoreSeo = (auditLogId: string, baseUpdatedAt: string | null, confirmDangerous?: boolean) =>
  call<{ state: SeoState }>('/api/admin/seo/rollback', { method: 'POST', json: { auditLogId, mode: 'restore', baseUpdatedAt, confirmDangerous } });
export const runHealth = () => call<{ report: HealthReport }>('/api/admin/seo/health', { method: 'POST', json: {} });

// ───────────────────────────── İçerik sayfaları ─────────────────────────────

export const pageKeys = {
  all: ['admin-pages'] as const,
  list: (q: Partial<CmsListQuery>) => ['admin-pages', 'list', q] as const,
  detail: (id: string) => ['admin-pages', 'detail', id] as const,
  history: (id: string) => ['admin-pages', 'history', id] as const,
};

export function fetchPages(q: Partial<CmsListQuery>, signal?: AbortSignal) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  return call<CmsPageList>(`/api/admin/pages?${sp.toString()}`, { signal });
}
const enc = encodeURIComponent;
export const fetchPage = (id: string, signal?: AbortSignal) => call<{ page: CmsPageDetail }>(`/api/admin/pages/${enc(id)}`, { signal });
export const fetchPageHistory = (id: string, signal?: AbortSignal) => call<{ items: CmsHistoryEntry[] }>(`/api/admin/pages/${enc(id)}/history`, { signal });
export const createPage = (v: CmsPageFormParsed) => call<{ page: CmsPageDetail }>('/api/admin/pages', { method: 'POST', json: v, idempotent: true });
export const updatePage = (id: string, v: CmsPageFormParsed, expectedUpdatedAt: string) =>
  call<{ page: CmsPageDetail; changed: string[] }>(`/api/admin/pages/${enc(id)}`, { method: 'PATCH', json: { ...v, expectedUpdatedAt } });
export const publishPage = (id: string, isPublished: boolean, expectedUpdatedAt: string) =>
  call<{ page: CmsPageDetail }>(`/api/admin/pages/${enc(id)}/publish`, { method: 'POST', json: { isPublished, expectedUpdatedAt } });
export const deletePage = (id: string, expectedUpdatedAt: string) =>
  call<{ id: string }>(`/api/admin/pages/${enc(id)}`, { method: 'DELETE', json: { expectedUpdatedAt } });
