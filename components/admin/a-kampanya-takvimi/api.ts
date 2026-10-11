'use client';

import type {
  CalendarData,
  CalendarKind,
  CampaignDetail,
  CampaignView,
  ConceptDetail,
  ConceptView,
  ListFilter,
  ListPage,
  PreviewResult,
} from '@/lib/campaigns-calendar/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) okur; alan hataları `fields`'te. */
export class CalendarApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly fields: Record<string, string>;
  constructor(status: number, message: string, code: string | null, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'CalendarApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function fieldMap(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(details)) return out;
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    const path = (d as { path?: unknown }).path;
    const message = (d as { message?: unknown }).message;
    if (typeof path === 'string' && typeof message === 'string' && !(path in out)) out[path] = message;
  }
  return out;
}

async function call<T>(url: string, init?: RequestInit & { idempotencyKey?: string }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new CalendarApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: Record<string, unknown> = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    /* gövdesiz / HTML (ör. 502) */
  }
  if (!res.ok || body.success === false || body.ok === false) {
    throw new CalendarApiError(
      res.status || 500,
      typeof body.error === 'string' ? body.error : 'İstek tamamlanamadı.',
      typeof body.code === 'string' ? body.code : null,
      fieldMap(body.details)
    );
  }
  return (body.data !== undefined ? body.data : body) as T;
}

const BASE = '/api/admin/campaigns-calendar';
const seg = (k: CalendarKind) => (k === 'campaign' ? 'campaigns' : 'concepts');

export const getCalendar = (from: string | null, days: number, signal?: AbortSignal) =>
  call<CalendarData>(`${BASE}?days=${days}${from ? `&from=${encodeURIComponent(from)}` : ''}`, { signal });

export function listItems(kind: 'campaign', p: ListParams, signal?: AbortSignal): Promise<ListPage<CampaignView>>;
export function listItems(kind: 'concept', p: ListParams, signal?: AbortSignal): Promise<ListPage<ConceptView>>;
export function listItems(kind: CalendarKind, p: ListParams, signal?: AbortSignal) {
  const qs = new URLSearchParams({ kind, filter: p.filter, page: String(p.page), size: String(p.size) });
  if (p.q) qs.set('q', p.q);
  return call(`${BASE}/${seg(kind)}?${qs.toString()}`, { signal });
}
export type ListParams = { filter: ListFilter; q: string; page: number; size: number };

export const getCampaignDetail = (id: string, signal?: AbortSignal) =>
  call<CampaignDetail>(`${BASE}/campaigns/${encodeURIComponent(id)}`, { signal });
export const getConceptDetail = (id: string, signal?: AbortSignal) =>
  call<ConceptDetail>(`${BASE}/concepts/${encodeURIComponent(id)}`, { signal });

type WriteResult = { id: string; version: string; synced?: boolean };

export function saveItem(kind: CalendarKind, id: string | null, data: unknown, baseVersion: string | null, idempotencyKey?: string) {
  return id
    ? call<WriteResult>(`${BASE}/${seg(kind)}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ data, baseVersion: baseVersion ?? undefined }),
      })
    : call<WriteResult>(`${BASE}/${seg(kind)}`, { method: 'POST', body: JSON.stringify({ data }), idempotencyKey });
}

export const setActive = (kind: CalendarKind, id: string, isActive: boolean, baseVersion: string) =>
  call<WriteResult>(`${BASE}/${seg(kind)}/${encodeURIComponent(id)}/active`, {
    method: 'POST',
    body: JSON.stringify({ isActive, baseVersion }),
  });

export const archiveItem = (kind: CalendarKind, id: string, reason: string, baseVersion: string) =>
  call<WriteResult>(`${BASE}/${seg(kind)}/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    body: JSON.stringify({ reason, baseVersion }),
  });

export const restoreItem = (kind: CalendarKind, id: string, baseVersion: string) =>
  call<WriteResult>(`${BASE}/${seg(kind)}/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    body: JSON.stringify({ baseVersion }),
  });

export const previewDraft = (kind: CalendarKind, data: unknown, excludeId: string | null, signal?: AbortSignal) =>
  call<PreviewResult>(`${BASE}/preview`, { method: 'POST', body: JSON.stringify({ kind, data, excludeId }), signal });

export const getBadges = (signal?: AbortSignal) =>
  call<{ badges: Array<{ id: string; name: string; icon: string; rarity: string }> }>(`${BASE}/badges`, { signal });

export const qk = {
  calendar: (from: string | null, days: number) => ['campaigns-calendar', 'calendar', from, days] as const,
  list: (kind: CalendarKind, p: ListParams) => ['campaigns-calendar', 'list', kind, p] as const,
  detail: (kind: CalendarKind, id: string) => ['campaigns-calendar', 'detail', kind, id] as const,
  badges: ['campaigns-calendar', 'badges'] as const,
  all: ['campaigns-calendar'] as const,
};
