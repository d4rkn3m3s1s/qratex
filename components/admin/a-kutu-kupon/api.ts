'use client';

import type {
  CampaignDetail,
  CampaignListPage,
  CouponOption,
  RecipientOption,
  SurpriseStats,
} from '@/lib/admin-surprise-boxes/contract';
import type {
  CouponBatchInput,
  CouponCreateInput,
  CouponDetail,
  CouponListItem,
  CouponListPage,
  CouponStats,
  CouponUpdateInput,
} from '@/lib/admin-coupons/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class KutuKuponApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  readonly body?: Record<string, unknown>;
  constructor(status: number, message: string, code: string | null, details?: unknown, body?: Record<string, unknown>) {
    super(message);
    this.name = 'KutuKuponApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown };

export function idemKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new KutuKuponApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T> & Record<string, unknown>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new KutuKuponApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details, env);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** Zod `details` → alan → mesaj (zarf v2 dizi biçimi ve eski `flatten()` biçimi). */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof KutuKuponApiError) || !e.details) return {};
  const out: Record<string, string> = {};
  if (Array.isArray(e.details)) {
    for (const d of e.details as Array<{ path?: string; message?: string }>) {
      if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
    }
  } else if (typeof e.details === 'object') {
    const fe = (e.details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    if (fe) for (const [k, v] of Object.entries(fe)) if (v?.[0]) out[k] = v[0];
  }
  return out;
}

const enc = encodeURIComponent;

// ───────── Sürpriz kutular ─────────
const SB = '/api/admin/surprise-box';
export const boxKeys = {
  all: ['admin-surprise'] as const,
  stats: () => ['admin-surprise', 'stats'] as const,
  list: (qs: string) => ['admin-surprise', 'list', qs] as const,
  detail: (id: string) => ['admin-surprise', 'detail', id] as const,
  coupons: () => ['admin-surprise', 'coupons'] as const,
  recipients: (q: string) => ['admin-surprise', 'recipients', q] as const,
};
export const fetchBoxStats = () => call<SurpriseStats>(`${SB}/stats`);
export const fetchCampaigns = (qs: string, signal?: AbortSignal) => call<CampaignListPage>(`${SB}${qs ? `?${qs}` : ''}`, { signal });
export const fetchCampaign = (id: string) => call<CampaignDetail>(`${SB}/campaigns/${enc(id)}`);
export const fetchBoxCoupons = () => call<CouponOption[]>(`${SB}/coupons`);
export const searchRecipients = (q: string, signal?: AbortSignal) => call<RecipientOption[]>(`${SB}/recipients?q=${enc(q)}`, { signal });
export const revokeCampaign = (id: string, reason: string) =>
  call<{ revoked: number; pointsReleased: number }>(`${SB}/campaigns/${enc(id)}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
    headers: { 'Idempotency-Key': idemKey() },
  });

export interface SendPreview {
  mode: 'single' | 'random';
  recipientCount: number;
  pointsPerBox: number;
  totalPoints: number;
  remainingToday: number;
  recipient?: { id: string; name: string | null; email: string | null };
}

export type SendBody = {
  title: string;
  message?: string;
  couponCode?: string;
  points: number;
  userId?: string;
  randomCount?: number;
};

export async function previewSend(body: SendBody): Promise<SendPreview> {
  const r = await call<{ preview: SendPreview }>(`${SB}/send`, { method: 'POST', body: JSON.stringify({ ...body, dryRun: true }) });
  return r.preview;
}

export function confirmSend(body: SendBody, preview: SendPreview, requestId: string) {
  return call<{ campaignId: string; count: number; totalPoints: number; duplicate: boolean }>(`${SB}/send`, {
    method: 'POST',
    body: JSON.stringify({ ...body, requestId, confirm: { recipientCount: preview.recipientCount, totalPoints: preview.totalPoints } }),
  });
}

// ───────── Kuponlar ─────────
const CP = '/api/admin/coupons';
export const couponKeys = {
  all: ['admin-coupons'] as const,
  stats: () => ['admin-coupons', 'stats'] as const,
  list: (qs: string) => ['admin-coupons', 'list', qs] as const,
  detail: (id: string) => ['admin-coupons', 'detail', id] as const,
};
export const fetchCouponStats = () => call<CouponStats>(`${CP}/stats`);
export const fetchCoupons = (qs: string, signal?: AbortSignal) => call<CouponListPage>(`${CP}${qs ? `?${qs}` : ''}`, { signal });
export const fetchCoupon = (id: string) => call<CouponDetail>(`${CP}/${enc(id)}`);
export const createCoupon = (body: CouponCreateInput) =>
  call<CouponListItem>(CP, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });
export const updateCoupon = (id: string, body: CouponUpdateInput) =>
  call<CouponListItem>(`${CP}/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const createBatch = (body: CouponBatchInput) =>
  call<{ batchId: string; codes: string[] }>(`${CP}/batch`, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });
export const exportUrl = (qs: string) => `${CP}/export${qs ? `?${qs}` : ''}`;
