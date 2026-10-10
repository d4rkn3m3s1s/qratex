'use client';

import type {
  CurationFilter,
  CurationPageDto,
  DisplayDto,
  WallFeedDto,
  WallOverviewDto,
  WallRange,
  WallRules,
  WallStatus,
} from '@/lib/dealer/voc-wall/config';

/** Zarf v2 hatası — QueryState (`status`/`code`) aynı nesneyi okur. */
export class WallApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  constructor(status: number, message: string, code: string | null, retryable: boolean) {
    super(message);
    this.name = 'WallApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

/** ADMIN bayi adına (salt-okunur) görüntülerken defineRoute'un okuduğu başlık. */
let actAsDealer: string | null = null;
export function setActAsDealer(id: string | null) {
  actAsDealer = id;
}

export async function wallFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (actAsDealer && url.startsWith('/api/dealer/')) headers['X-Act-As-Dealer'] = actAsDealer;
  if (init?.body) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers });
  } catch {
    throw new WallApiError(0, 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.', 'NETWORK', true);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as { ok?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };
  if (!res.ok || env.ok === false) {
    throw new WallApiError(res.status, env.error || 'İstek tamamlanamadı.', env.code ?? null, !!env.retryable || res.status >= 500);
  }
  return env.data as T;
}

export { VOC_ROOT, overviewKey, curationKey, previewKey, displaysKey } from './keys';

const qs = (o: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const fetchOverview = (range: WallRange, qrCodeId: string | null) =>
  wallFetch<WallOverviewDto>(`/api/dealer/voc-wall${qs({ range, qrCodeId })}`);
export const fetchCuration = (filter: CurationFilter, page: number, qrCodeId: string | null) =>
  wallFetch<CurationPageDto>(`/api/dealer/voc-wall/items${qs({ filter, page, qrCodeId })}`);
export const fetchPreview = () => wallFetch<WallFeedDto>('/api/dealer/voc-wall/preview');
export const fetchDisplays = () => wallFetch<{ displays: DisplayDto[] }>('/api/dealer/voc-wall/displays');

export const setItemStatus = (id: string, status: WallStatus) =>
  wallFetch<{ status: WallStatus }>(`/api/dealer/voc-wall/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
export const saveRules = (rules: WallRules) =>
  wallFetch<{ rules: WallRules }>('/api/dealer/voc-wall/rules', { method: 'PUT', body: JSON.stringify(rules) });
export const createDisplayLink = (label: string, qrCodeId: string | null) =>
  wallFetch<{ display: DisplayDto; token: string }>('/api/dealer/voc-wall/displays', {
    method: 'POST',
    body: JSON.stringify({ label, qrCodeId }),
  });
export const revokeDisplayLink = (id: string) =>
  wallFetch<{ display: DisplayDto }>(`/api/dealer/voc-wall/displays/${encodeURIComponent(id)}`, { method: 'DELETE' });
