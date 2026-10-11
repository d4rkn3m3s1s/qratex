'use client';

import type {
  DealerDetail,
  DealerListPage,
  DealerPolicyPatch,
  LearningState,
  ModelRouting,
  ModelsState,
  NoteKey,
  NotePreviewResult,
  PromptsState,
  StudioAuditPage,
  StudioOverview,
  ToneHistoryEntry,
  TonePreviewResult,
  TonesState,
} from '@/lib/ai-studio/contract';
import { clientMessage } from '@/lib/client-messages';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class StudioApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'StudioApiError';
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
    throw new StudioApiError(0, clientMessage('network'), 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new StudioApiError(res.status || 500, env.error || clientMessage('requestFailed'), env.code ?? null, env.details);
  }
  return (env.data !== undefined ? env.data : (env as unknown)) as T;
}

export function errorText(e: unknown, fallback = clientMessage('failed')): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function isConflict(e: unknown): boolean {
  return e instanceof StudioApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT');
}

/** Sunucu doğrulama ayrıntısından alan → mesaj. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(e instanceof StudioApiError) || !Array.isArray(e.details)) return out;
  for (const d of e.details as Array<{ path?: unknown; message?: unknown }>) {
    if (typeof d?.path === 'string' && typeof d?.message === 'string' && !out[d.path]) out[d.path] = d.message;
  }
  return out;
}

function idemKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`;
  return rnd.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

const enc = encodeURIComponent;
const json = (method: string, body: unknown, extra?: Record<string, string>): RequestInit => ({ method, body: JSON.stringify(body), headers: extra });

const BASE = '/api/admin/ai/studio';

export const studioKeys = {
  all: ['ai-studio'] as const,
  overview: () => ['ai-studio', 'overview'] as const,
  prompts: () => ['ai-studio', 'prompts'] as const,
  learning: () => ['ai-studio', 'learning'] as const,
  tones: () => ['ai-studio', 'tones'] as const,
  toneHistory: (id: string) => ['ai-studio', 'tones', 'history', id] as const,
  dealers: (qs: string) => ['ai-studio', 'dealers', qs] as const,
  dealer: (id: string) => ['ai-studio', 'dealer', id] as const,
  models: () => ['ai-studio', 'models'] as const,
  history: (entity: string) => ['ai-studio', 'history', entity] as const,
};

export const fetchOverview = () => call<StudioOverview>(`${BASE}/overview`);

export const fetchPrompts = () => call<PromptsState>(`${BASE}/prompts`);
export const createNoteDraft = (body: { key: NoteKey; body: string | null; note: string; basedOn: string | null; baseVersion: string }) =>
  call<PromptsState>(`${BASE}/prompts/drafts`, json('POST', body, { 'Idempotency-Key': idemKey() }));
export const noteVersionAction = (id: string, action: 'publish' | 'discard', baseVersion: string) =>
  call<PromptsState>(`${BASE}/prompts/versions/${enc(id)}`, json('POST', { action, baseVersion }));
export const previewNotes = (body: { system: string | null; chat: string | null }) => call<NotePreviewResult>(`${BASE}/prompts/preview`, json('POST', body));

export const fetchLearning = () => call<LearningState>(`${BASE}/learning`);
export const runTraining = () => call<LearningState>(`${BASE}/learning/train`, { method: 'POST' });
export const decideProposal = (body: { action: 'approve' | 'reject'; proposalId: string; reason?: string }) =>
  call<LearningState>(`${BASE}/learning/proposal`, json('POST', body));
export const restoreLearning = (index: number, expectedVersion: number) => call<LearningState>(`${BASE}/learning/restore`, json('POST', { index, expectedVersion }));

export const fetchTones = () => call<TonesState>(`${BASE}/tones`);
export const createTone = (body: { slug: string; name: string; systemPrompt: string; reason: string }) =>
  call<TonesState>(`${BASE}/tones`, json('POST', body, { 'Idempotency-Key': idemKey() }));
export const updateTone = (id: string, body: { name?: string; systemPrompt?: string; reason: string; expectedVersion: string }) =>
  call<TonesState>(`${BASE}/tones/${enc(id)}`, json('PATCH', body));
export const setToneStatus = (id: string, body: { active: boolean; reason: string; expectedVersion: string }) =>
  call<TonesState>(`${BASE}/tones/${enc(id)}/status`, json('POST', body));
export const fetchToneHistory = (id: string) => call<ToneHistoryEntry[]>(`${BASE}/tones/${enc(id)}/history`);
export const previewTone = (body: { slug: string; systemPrompt: string | null; rating: number; text: string }) =>
  call<TonePreviewResult>(`${BASE}/tones/preview`, json('POST', body));

export const fetchDealers = (qs: string, signal?: AbortSignal) => call<DealerListPage>(`${BASE}/dealers?${qs}`, { signal });
export const fetchDealer = (id: string) => call<DealerDetail>(`${BASE}/dealers/${enc(id)}`);
export const updateDealerPolicy = (id: string, body: Omit<DealerPolicyPatch, 'customPrompt'> & { customPrompt?: string | null }) =>
  call<DealerDetail>(`${BASE}/dealers/${enc(id)}`, json('PATCH', body));
export const refreshDealerProfile = (id: string) => call<DealerDetail>(`${BASE}/dealers/${enc(id)}/profile`, { method: 'POST' });

export const fetchModels = () => call<ModelsState>(`${BASE}/models`);
export const saveModels = (body: { routing: ModelRouting; reason: string; baseVersion: string }) => call<ModelsState>(`${BASE}/models`, json('PUT', body));

export const fetchHistory = (entity: string, cursor?: string) => {
  const qs = new URLSearchParams();
  if (entity) qs.set('entity', entity);
  if (cursor) qs.set('cursor', cursor);
  return call<StudioAuditPage>(`${BASE}/history?${qs.toString()}`);
};
