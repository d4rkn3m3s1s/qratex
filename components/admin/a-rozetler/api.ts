'use client';

import type {
  BadgeActionInput,
  BadgeActionResult,
  BadgeBulkInput,
  BadgeBulkResult,
  BadgeDetail,
  BadgeListPage,
  BadgeStats,
  BadgeUpsertInput,
  LabCatalog,
  LabClassifyResult,
  LabRevealCharacter,
  LabSandboxInput,
  LabSandboxResult,
  LabStatus,
  LabTarget,
  ThresholdHistoryPage,
  ThresholdImpact,
  ThresholdOverrides,
  ThresholdsState,
} from '@/lib/admin-badges/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class BadgesApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'BadgesApiError';
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
    throw new BadgesApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new BadgesApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details);
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

const BASE = '/api/admin/badges';
const enc = encodeURIComponent;
const post = (body: unknown, extra?: Record<string, string>): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: extra });

export const badgeKeys = {
  all: ['admin-badges'] as const,
  stats: () => ['admin-badges', 'stats'] as const,
  list: (qs: string) => ['admin-badges', 'list', qs] as const,
  detail: (id: string) => ['admin-badges', 'detail', id] as const,
  thresholds: () => ['admin-badges', 'thresholds'] as const,
  thresholdHistory: (page: number) => ['admin-badges', 'thresholds', 'history', page] as const,
  labCatalog: () => ['admin-badges', 'lab', 'catalog'] as const,
  labTargets: (q: string) => ['admin-badges', 'lab', 'targets', q] as const,
  labStatus: (user: string) => ['admin-badges', 'lab', 'status', user] as const,
};

export const fetchStats = () => call<BadgeStats>(`${BASE}/stats`);
export const fetchBadges = (qs: string, signal?: AbortSignal) => call<BadgeListPage>(`${BASE}?${qs}`, { signal });
export const fetchBadge = (id: string) => call<BadgeDetail>(`${BASE}/${enc(id)}`);
export const createBadge = (body: BadgeUpsertInput) => call<{ id: string }>(BASE, post(body, { 'Idempotency-Key': idemKey() }));
export const updateBadge = (id: string, body: Partial<BadgeUpsertInput>) =>
  call<BadgeDetail>(`${BASE}/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const badgeAction = <T extends BadgeActionResult = BadgeActionResult>(id: string, body: BadgeActionInput) =>
  call<T>(`${BASE}/${enc(id)}/actions`, post(body));
export const bulkAction = (body: BadgeBulkInput) => call<BadgeBulkResult>(`${BASE}/bulk`, post(body));

export const fetchThresholds = () => call<ThresholdsState>(`${BASE}/thresholds`);
export const saveThresholds = (overrides: ThresholdOverrides, baseVersion: string, revertOf?: string) =>
  call<ThresholdsState>(`${BASE}/thresholds`, { method: 'PUT', body: JSON.stringify({ overrides, baseVersion, ...(revertOf ? { revertOf } : {}) }) });
export const previewThresholds = (overrides: ThresholdOverrides) => call<ThresholdImpact>(`${BASE}/thresholds/preview`, post({ overrides }));
export const fetchThresholdHistory = (page: number) => call<ThresholdHistoryPage>(`${BASE}/thresholds/history?page=${page}`);

export const fetchLabCatalog = () => call<LabCatalog>(`${BASE}/lab/catalog`);
export const fetchLabTargets = (q: string) => call<{ items: LabTarget[] }>(`${BASE}/lab/targets${q ? `?q=${enc(q)}` : ''}`).then((r) => r.items);
export const fetchLabStatus = (user: string) => call<LabStatus>(`${BASE}/lab?user=${enc(user)}`);
export const labClassify = (text: string) => call<LabClassifyResult>(`${BASE}/lab/classify`, post({ text }));
export const labPreview = (body: { badgeId: string; why?: string; ratePct?: number | null }) => call<LabRevealCharacter>(`${BASE}/lab/preview`, post(body));
export const labSandbox = (body: LabSandboxInput) => call<LabSandboxResult>(`${BASE}/lab/sandbox`, post(body));

/** İkon yükleme (R2) — mevcut ortak yükleme ucu; HTTPS URL döner. */
export async function uploadBadgeIcon(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', 'badges');
  let res: Response;
  try {
    res = await fetch('/api/admin/assets/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
  } catch {
    throw new BadgesApiError(0, 'Bağlantı kurulamadı.', 'NETWORK');
  }
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; path?: string; error?: string };
  if (!res.ok || body.success === false || !(body.url || body.path)) {
    throw new BadgesApiError(res.status, body.error || 'İkon yüklenemedi.', null);
  }
  return (body.url || body.path) as string;
}
