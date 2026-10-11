'use client';

import type {
  CoveragePage,
  DealerRef,
  DiscoveryConfigValue,
  DiscoveryState,
  HistoryPage,
  PreviewInput,
  PreviewResult,
} from '@/lib/admin-discovery/contract';
import type {
  DonationStats,
  ProjectActionInput,
  ProjectDetail,
  ProjectListPage,
  ProjectUpsertValues,
  TransactionDetail,
  TransactionPage,
} from '@/lib/admin-donations/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class PanelApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'PanelApiError';
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
    throw new PanelApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new PanelApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? (res.status === 409 ? 'VERSION_CONFLICT' : null), env.details);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function isConflict(e: unknown): boolean {
  return e instanceof PanelApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT');
}

function idemKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

const enc = encodeURIComponent;
const json = (method: string, body: unknown, extra?: Record<string, string>): RequestInit => ({ method, body: JSON.stringify(body), headers: extra });

// ───────────────────────────── Keşif ─────────────────────────────

const DISC = '/api/admin/discovery';
export const discoveryKeys = {
  all: ['admin-discovery'] as const,
  state: () => ['admin-discovery', 'state'] as const,
  coverage: (qs: string) => ['admin-discovery', 'coverage', qs] as const,
  dealers: (q: string) => ['admin-discovery', 'dealers', q] as const,
  history: (page: number) => ['admin-discovery', 'history', page] as const,
};

export const fetchDiscovery = () => call<DiscoveryState>(DISC);
export const saveDiscovery = (config: DiscoveryConfigValue, baseVersion: string, restoredFrom?: string) =>
  call<{ config: DiscoveryConfigValue; version: string; dealers: Record<string, DealerRef> }>(DISC, json('PUT', { config, baseVersion, ...(restoredFrom ? { restoredFrom } : {}) }));
export const fetchCoverage = (qs: string, signal?: AbortSignal) => call<CoveragePage>(`${DISC}/coverage?${qs}`, { signal });
export const searchDealers = (q: string, signal?: AbortSignal) => call<{ items: DealerRef[] }>(`${DISC}/dealers?q=${enc(q)}`, { signal }).then((r) => r.items);
export const resolveDealerIds = (ids: string[]) => call<{ items: DealerRef[] }>(`${DISC}/dealers?ids=${enc(ids.join(','))}`).then((r) => r.items);
export const fetchHistory = (page: number) => call<HistoryPage>(`${DISC}/history?page=${page}`);
export const runPreview = (body: PreviewInput) => call<PreviewResult>(`${DISC}/preview`, json('POST', body));

/** Sponsor görseli (R2) — ortak yükleme ucu; HTTPS URL döner. */
export async function uploadImage(file: File, folder: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', folder);
  let res: Response;
  try {
    res = await fetch('/api/admin/assets/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
  } catch {
    throw new PanelApiError(0, 'Bağlantı kurulamadı.', 'NETWORK');
  }
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; path?: string; error?: string };
  if (!res.ok || body.success === false || !(body.url || body.path)) {
    throw new PanelApiError(res.status, body.error || 'Görsel yüklenemedi.', null);
  }
  return (body.url || body.path) as string;
}

// ───────────────────────────── Bağış ─────────────────────────────

const DON = '/api/admin/donations';
export const donationKeys = {
  all: ['admin-donations'] as const,
  stats: () => ['admin-donations', 'stats'] as const,
  list: (qs: string) => ['admin-donations', 'list', qs] as const,
  detail: (id: string) => ['admin-donations', 'detail', id] as const,
  transactions: (qs: string) => ['admin-donations', 'tx', qs] as const,
  transaction: (id: string) => ['admin-donations', 'tx-detail', id] as const,
};

export const fetchDonationStats = () => call<DonationStats>(`${DON}/stats`);
export const fetchProjects = (qs: string, signal?: AbortSignal) => call<ProjectListPage>(`${DON}?${qs}`, { signal });
export const fetchProject = (id: string) => call<ProjectDetail>(`${DON}/${enc(id)}`);
export const createProject = (values: ProjectUpsertValues) => call<{ id: string }>(DON, json('POST', values, { 'Idempotency-Key': idemKey() }));
export const updateProject = (id: string, values: ProjectUpsertValues, baseUpdatedAt: string) =>
  call<{ id: string; updatedAt: string }>(`${DON}/${enc(id)}`, json('PATCH', { values, baseUpdatedAt }));
export const projectAction = (id: string, body: ProjectActionInput) => call<{ id: string; status: string; current: number }>(`${DON}/${enc(id)}/actions`, json('POST', body));
export const fetchTransactions = (qs: string, signal?: AbortSignal) => call<TransactionPage>(`${DON}/transactions?${qs}`, { signal });
export const fetchTransaction = (id: string) => call<TransactionDetail>(`${DON}/transactions/${enc(id)}`);
export const exportUrl = (qs: string) => `${DON}/export${qs ? `?${qs}` : ''}`;
