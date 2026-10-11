'use client';

import type {
  ActivityRow,
  AdjustPointsInput,
  AuditRow,
  CatalogBadge,
  CatalogReward,
  CreateUserInput,
  EarnedBadge,
  LedgerPage,
  Paged,
  ProfilePatch,
  User360,
  UserFeedbackRow,
  UserListPage,
  UserRewardRow,
  UsersStats,
} from '@/lib/admin-users/contract';
import type { DeletionImpact } from '@/lib/data-safety/archive';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class UsersApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  readonly retryable: boolean;
  constructor(status: number, message: string, code: string | null, details: unknown, retryable: boolean) {
    super(message);
    this.name = 'UsersApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown; retryable?: boolean };

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
    throw new UsersApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK', undefined, true);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new UsersApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details, env.retryable === true);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

const post = <T>(url: string, body?: unknown, headers?: Record<string, string>) =>
  call<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}), headers });

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof UsersApiError) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function newRequestId(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

const BASE = '/api/admin/users';
const u = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

// ───────────────────────────── Sorgu anahtarları ─────────────────────────────

export const usersKeys = {
  all: ['admin-users'] as const,
  stats: () => ['admin-users', 'stats'] as const,
  list: (qs: string) => ['admin-users', 'list', qs] as const,
  detail: (id: string) => ['admin-users', 'detail', id] as const,
  sub: (id: string, kind: string, page = 1) => ['admin-users', 'detail', id, kind, page] as const,
  catalog: (kind: 'badges' | 'rewards' | 'admins') => ['admin-users', 'catalog', kind] as const,
};

// ───────────────────────────── Okuma ─────────────────────────────

export const fetchStats = () => call<UsersStats>(`${BASE}/stats`);
export const fetchList = (qs: string, signal?: AbortSignal) => call<UserListPage>(`${BASE}/list?${qs}`, { signal });
export const fetchUser = (id: string) => call<User360>(u(id));
export const fetchLedger = (id: string, page: number, size = 20) => call<LedgerPage>(`${u(id)}/ledger?page=${page}&size=${size}`);
export const fetchBadges = (id: string) => call<{ items: EarnedBadge[] }>(`${u(id)}/badges`);
export const fetchRewards = (id: string, page: number, size = 10) => call<Paged<UserRewardRow>>(`${u(id)}/rewards?page=${page}&size=${size}`);
export const fetchFeedbacks = (id: string, page: number, size = 10) =>
  call<Paged<UserFeedbackRow>>(`${u(id)}/feedbacks?page=${page}&size=${size}`);
export const fetchAudit = (id: string, page: number, size = 20) => call<Paged<AuditRow>>(`${u(id)}/audit?page=${page}&size=${size}`);
export const fetchActivity = (id: string) => call<{ items: ActivityRow[] }>(`${u(id)}/activity`);
export const fetchBadgeCatalog = () => call<{ items: CatalogBadge[] }>(`${BASE}/catalog?kind=badges`);
export const fetchRewardCatalog = () => call<{ items: CatalogReward[] }>(`${BASE}/catalog?kind=rewards`);
export const fetchAdmins = () => call<{ items: Array<{ id: string; name: string | null; email: string }> }>(`${BASE}/catalog?kind=admins`);
export type PlanOption = { id: string; name: string; price: number; currency: string; interval: string; isActive: boolean };
export async function fetchPlans(): Promise<PlanOption[]> {
  const raw = await call<unknown>('/api/admin/pricing');
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { plans?: unknown })?.plans) ? (raw as { plans: unknown[] }).plans : [];
  return (list as PlanOption[]).filter((p) => p && typeof p.id === 'string');
}

// ───────────────────────────── Yazma ─────────────────────────────

export const adjustPoints = (id: string, body: AdjustPointsInput) =>
  post<{ delta: number; xpDelta: number; pointsBefore: number; points: number; xp: number; level: number; duplicate: boolean }>(`${u(id)}/points`, body);
export const issueApproval = (id: string, body: { requesterId: string; delta: number; xp: number; reason: string }) =>
  post<{ token: string; expiresAt: string }>(`${u(id)}/approval`, body);
export const changeRole = (id: string, body: { role: string; reason: string; confirmPhrase?: string }) =>
  post<{ status: 'changed' | 'pending_approval'; role: string; requestId?: string }>(`${u(id)}/role`, body);
export const decideElevation = (id: string, body: { requestId: string; decision: 'approve' | 'reject'; note?: string }) =>
  post<{ status: string; role: string }>(`${u(id)}/elevation`, body);
export const setSuspension = (id: string, body: { action: 'suspend' | 'unsuspend'; reason?: string }) =>
  post<{ suspended: boolean }>(`${u(id)}/suspension`, body);
export const revokeSessions = (id: string) => post<{ sessionVersion: number; revokedAt: string }>(`${u(id)}/sessions`);
export const sendAccessLink = (id: string) => post<{ kind: 'reset' | 'verify'; sentAt: string }>(`${u(id)}/access-link`);
export const notifyUser = (id: string, body: { title: string; message: string; type: string }) =>
  post<{ id: string }>(`${u(id)}/notify`, body, { 'Idempotency-Key': newRequestId() });
export const grantBadge = (id: string, badgeId: string) =>
  post<{ badgeId: string; name: string }>(`${u(id)}/badges`, { badgeId }, { 'Idempotency-Key': newRequestId() });
export const revokeBadge = (id: string, badgeId: string, reason: string) =>
  call<{ badgeId: string }>(`${u(id)}/badges`, { method: 'DELETE', body: JSON.stringify({ badgeId, reason }) });
export const grantReward = (id: string, rewardId: string) =>
  post<{ userRewardId: string; rewardName: string; hasCode: boolean }>(`${u(id)}/rewards`, { rewardId }, { 'Idempotency-Key': newRequestId() });
export const patchProfile = (id: string, body: ProfilePatch) =>
  call<{ changed: string[] }>(`${u(id)}/profile`, { method: 'PATCH', body: JSON.stringify(body) });
export const assignPlan = (id: string, planId: string | null) =>
  call<Record<string, unknown>>(`${u(id)}/plan`, { method: 'PATCH', body: JSON.stringify({ pricingPlanId: planId }) });
export const previewAnonymize = (id: string) => call<{ impact: DeletionImpact; alreadyAnonymized: boolean }>(`${u(id)}/anonymize`);
export const anonymize = (id: string, confirmPhrase: string) =>
  post<{ anonymized: boolean; alreadyAnonymized: boolean }>(`${u(id)}/anonymize`, { confirmPhrase });
export const createUser = (body: CreateUserInput) =>
  post<{ id: string; email: string; mode: string; mailSent: boolean }>(`${BASE}/create`, body, { 'Idempotency-Key': newRequestId() });

/** Toplu işlem (eski zarf v1 uç: `/api/admin/users/bulk`). */
export type BulkResult = {
  suspended?: number;
  unsuspended?: number;
  anonymized?: number;
  skipped?: Array<{ id: string; reason: string }>;
  failed?: Array<{ id: string; reason: string }>;
  impact?: DeletionImpact;
};
export const bulkAction = (body: Record<string, unknown>) => post<BulkResult>(`${BASE}/bulk`, body);
