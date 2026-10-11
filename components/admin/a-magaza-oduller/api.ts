'use client';

import type {
  CosmeticActionInput,
  CosmeticDetail,
  CosmeticListItem,
  CosmeticStats,
  CosmeticUpsertInput,
  Paged,
  PoolActionInput,
  PoolResult,
  RedemptionActionInput,
  RedemptionItem,
  RedemptionStats,
  RewardActionInput,
  RewardDetail,
  RewardListItem,
  RewardStats,
  RewardUpsertInput,
  SeedResult,
} from '@/lib/admin-store/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class StoreApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'StoreApiError';
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
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new StoreApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new StoreApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function idemKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

const BASE = '/api/admin/store';
const enc = encodeURIComponent;
/** Her aksiyon kendi tek-kez anahtarıyla: çift tıklama/ağ tekrarı ikinci kez uygulanmaz. */
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });

export const storeKeys = {
  all: ['admin-store'] as const,
  rewardStats: () => ['admin-store', 'rewards', 'stats'] as const,
  rewards: (qs: string) => ['admin-store', 'rewards', 'list', qs] as const,
  reward: (id: string) => ['admin-store', 'rewards', 'detail', id] as const,
  redemptionStats: () => ['admin-store', 'redemptions', 'stats'] as const,
  redemptions: (qs: string) => ['admin-store', 'redemptions', 'list', qs] as const,
  cosmeticStats: () => ['admin-store', 'cosmetics', 'stats'] as const,
  cosmetics: (qs: string) => ['admin-store', 'cosmetics', 'list', qs] as const,
  cosmetic: (id: string) => ['admin-store', 'cosmetics', 'detail', id] as const,
};

// Ödüller
export const fetchRewardStats = () => call<RewardStats>(`${BASE}/rewards/stats`);
export const fetchRewards = (qs: string, signal?: AbortSignal) => call<Paged<RewardListItem>>(`${BASE}/rewards?${qs}`, { signal });
export const fetchReward = (id: string) => call<RewardDetail>(`${BASE}/rewards/${enc(id)}`);
export const createReward = (body: RewardUpsertInput) => call<RewardListItem>(`${BASE}/rewards`, post(body));
export const updateReward = (id: string, expectedUpdatedAt: string, changes: Record<string, unknown>) =>
  call<RewardListItem>(`${BASE}/rewards/${enc(id)}`, { method: 'PATCH', body: JSON.stringify({ expectedUpdatedAt, changes }) });
export const rewardAction = (id: string, body: RewardActionInput) =>
  call<{ item: RewardListItem; createdId?: string }>(`${BASE}/rewards/${enc(id)}/actions`, post(body));
export const poolAction = (id: string, body: PoolActionInput) => call<PoolResult>(`${BASE}/rewards/${enc(id)}/pool`, post(body));

// Talepler
export const fetchRedemptionStats = () => call<RedemptionStats>(`${BASE}/redemptions/stats`);
export const fetchRedemptions = (qs: string, signal?: AbortSignal) => call<Paged<RedemptionItem>>(`${BASE}/redemptions?${qs}`, { signal });
export const redemptionAction = (id: string, body: RedemptionActionInput) => call<RedemptionItem>(`${BASE}/redemptions/${enc(id)}`, post(body));

// Kozmetik
export const fetchCosmeticStats = () => call<CosmeticStats>(`${BASE}/cosmetics/stats`);
export const fetchCosmetics = (qs: string, signal?: AbortSignal) => call<Paged<CosmeticListItem>>(`${BASE}/cosmetics?${qs}`, { signal });
export const fetchCosmetic = (id: string) => call<CosmeticDetail>(`${BASE}/cosmetics/${enc(id)}`);
export const createCosmetic = (body: CosmeticUpsertInput) => call<CosmeticListItem>(`${BASE}/cosmetics`, post(body));
export const updateCosmetic = (id: string, expected: Record<string, unknown>, changes: Record<string, unknown>) =>
  call<CosmeticListItem>(`${BASE}/cosmetics/${enc(id)}`, { method: 'PATCH', body: JSON.stringify({ expected, changes }) });
export const cosmeticAction = (id: string, body: CosmeticActionInput) =>
  call<{ item: CosmeticListItem; createdId?: string }>(`${BASE}/cosmetics/${enc(id)}/actions`, post(body));
export const seedCosmetics = () => call<SeedResult>(`${BASE}/cosmetics/seed`, post({}));

/** Görsel yükleme (R2) — ortak yükleme ucu; HTTPS URL döner. */
export async function uploadStoreImage(file: File, folder: 'rewards' | 'cosmetics'): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', folder);
  let res: Response;
  try {
    res = await fetch('/api/admin/assets/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
  } catch {
    throw new StoreApiError(0, 'Bağlantı kurulamadı.', 'NETWORK');
  }
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; path?: string; error?: string };
  if (!res.ok || body.success === false || !(body.url || body.path)) {
    throw new StoreApiError(res.status, body.error || 'Görsel yüklenemedi.', null);
  }
  return (body.url || body.path) as string;
}

/** Yalnız değişen alanlar (PATCH gövdesi). */
export function changedFields<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(after) as Array<keyof T>) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = after[k];
  }
  return out;
}
