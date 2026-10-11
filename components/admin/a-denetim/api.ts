'use client';

import type { AuditDetail, AuditFacets, AuditPage, AuditSummary, RevertKind } from '@/lib/admin-audit/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) aynı nesneyi okur (401/403/500 "kayıt yok" görünmez). */
export class AuditApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.name = 'AuditApiError';
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new AuditApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new AuditApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

const BASE = '/api/admin/audit';
export const auditKeys = {
  all: ['admin-audit'] as const,
  list: (qs: string, limit: number) => ['admin-audit', 'list', qs, limit] as const,
  facets: () => ['admin-audit', 'facets'] as const,
  summary: () => ['admin-audit', 'summary'] as const,
  detail: (id: string) => ['admin-audit', 'detail', id] as const,
};

export const fetchAuditPage = (qs: string, signal?: AbortSignal) => call<AuditPage>(`${BASE}?${qs}`, { signal });
export const fetchAuditFacets = () => call<AuditFacets>(`${BASE}/facets`);
export const fetchAuditSummary = () => call<AuditSummary>(`${BASE}/summary`);
export const fetchAuditDetail = (id: string, signal?: AbortSignal) => call<AuditDetail>(`${BASE}/${encodeURIComponent(id)}`, { signal });
export const exportUrl = (qs: string) => `${BASE}/export${qs ? `?${qs}` : ''}`;

/** Mevcut geri alma uçları (ayarlar / SEO) — geri alma da yeni bir denetim kaydı üretir. */
export const revertEntry = (endpoint: string, auditLogId: string) =>
  call<{ success?: boolean }>(endpoint, { method: 'POST', body: JSON.stringify({ auditLogId }) });

export const REVERT_LABEL: Record<RevertKind, string> = { settings: 'Ayarları bu kayıttan önceki hâline döndür', seo: 'SEO ayarlarını bu kayıttan önceki sürüme döndür' };
