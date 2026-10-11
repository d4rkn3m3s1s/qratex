'use client';

import type {
  AssignmentCheck,
  CreateExperimentInput,
  ExperimentActionInput,
  ExperimentResults,
  ExperimentsState,
  HistoryItem,
  ModulesOverview,
  Paged,
  PatchModuleInput,
  RolloutsState,
  UpsertRolloutInput,
} from '@/lib/admin-flags/contract';

/** Zarf v2 hatası — QueryState (`status`/`code`) ve formlar aynı nesneyi okur. */
export class FeatureControlApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.name = 'FeatureControlApiError';
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new FeatureControlApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz (ör. ağ geçidi HTML'i) */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new FeatureControlApiError(res.status, env.error || env.message || `İstek başarısız (${res.status}).`, env.code ?? null);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');
export const isConflict = (e: unknown) => e instanceof FeatureControlApiError && e.status === 409;

const BASE = '/api/admin/feature-control';
const enc = encodeURIComponent;

export const fcKeys = {
  all: ['feature-control'] as const,
  overview: () => ['feature-control', 'overview'] as const,
  rollouts: () => ['feature-control', 'rollouts'] as const,
  experiments: () => ['feature-control', 'experiments'] as const,
  results: (id: string) => ['feature-control', 'results', id] as const,
  history: (qs: string) => ['feature-control', 'history', qs] as const,
};

export const fetchOverview = (signal?: AbortSignal) => call<ModulesOverview>(`${BASE}/overview`, { signal });
export const patchModule = (key: string, input: PatchModuleInput) =>
  call<{ key: string; enabled: boolean; version: string }>(`${BASE}/modules/${enc(key)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const fetchHistory = (qs: string, signal?: AbortSignal) => call<Paged<HistoryItem>>(`${BASE}/history${qs ? `?${qs}` : ''}`, { signal });

export const fetchRollouts = (signal?: AbortSignal) => call<RolloutsState>(`${BASE}/rollouts`, { signal });
export const putRollout = (key: string, input: UpsertRolloutInput) =>
  call<{ id: string }>(`${BASE}/rollouts/${enc(key)}`, { method: 'PUT', body: JSON.stringify(input) });
export const archiveFlag = (id: string, reason: string) =>
  call<{ archived: boolean }>(`${BASE}/flags/${enc(id)}/archive`, { method: 'POST', body: JSON.stringify({ reason }) });

export const fetchExperiments = (signal?: AbortSignal) => call<ExperimentsState>(`${BASE}/experiments`, { signal });
export const createExperiment = (input: CreateExperimentInput) =>
  call<{ version: string }>(`${BASE}/experiments`, { method: 'POST', body: JSON.stringify(input) });
export const actOnExperiment = (id: string, input: ExperimentActionInput) =>
  call<{ version: string }>(`${BASE}/experiments/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const fetchResults = (id: string, signal?: AbortSignal) => call<ExperimentResults>(`${BASE}/experiments/${enc(id)}/results`, { signal });
export const checkAssignment = (id: string, subject: string) =>
  call<AssignmentCheck>(`${BASE}/experiments/${enc(id)}/assignment?subject=${enc(subject)}`);
