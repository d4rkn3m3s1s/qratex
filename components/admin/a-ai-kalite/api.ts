'use client';

import type {
  ChatDetail,
  ChatListItem,
  ChatStats,
  Paged,
  QualityMetrics,
  SampleActionInput,
  SampleDetail,
  SampleListItem,
  SampleRunInput,
  SampleRunResult,
} from '@/lib/ai-quality/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar aynı nesneyi okur. */
export class QualityApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'QualityApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string; details?: unknown };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new QualityApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new QualityApiError(res.status, env.error || env.message || `İstek başarısız (${res.status}).`, env.code ?? null, env.details);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');

const BASE = '/api/admin/ai/quality';

export const qualityKeys = {
  all: ['ai-quality'] as const,
  metrics: () => ['ai-quality', 'metrics'] as const,
  samples: (qs: string) => ['ai-quality', 'samples', qs] as const,
  sample: (id: string) => ['ai-quality', 'sample', id] as const,
  chats: (qs: string) => ['ai-quality', 'chats', qs] as const,
  chat: (id: string) => ['ai-quality', 'chat', id] as const,
  chatStats: (period: string) => ['ai-quality', 'chat-stats', period] as const,
};

export const fetchMetrics = (signal?: AbortSignal) => call<QualityMetrics>(`${BASE}/metrics`, { signal });
export const fetchSamples = (qs: string, signal?: AbortSignal) => call<Paged<SampleListItem>>(`${BASE}/samples${qs ? `?${qs}` : ''}`, { signal });
export const fetchSample = (id: string, signal?: AbortSignal) => call<SampleDetail>(`${BASE}/samples/${encodeURIComponent(id)}`, { signal });
export const sampleAction = (id: string, input: SampleActionInput) =>
  call<SampleDetail>(`${BASE}/samples/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const runSampling = (input: SampleRunInput) =>
  call<SampleRunResult>(`${BASE}/run`, { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': crypto.randomUUID() } });

export const fetchChats = (qs: string, signal?: AbortSignal) => call<Paged<ChatListItem>>(`${BASE}/chats${qs ? `?${qs}` : ''}`, { signal });
export const fetchChat = (id: string, signal?: AbortSignal) => call<ChatDetail>(`${BASE}/chats/${encodeURIComponent(id)}`, { signal });
export const fetchChatStats = (period: string, signal?: AbortSignal) => call<ChatStats>(`${BASE}/chats/stats?period=${encodeURIComponent(period)}`, { signal });
export const revealChat = (id: string, reason: string) =>
  call<{ userMessage: string; assistantMessage: string }>(`${BASE}/chats/${encodeURIComponent(id)}/reveal`, { method: 'POST', body: JSON.stringify({ reason }) });
export const chatExportUrl = (qs: string) => `${BASE}/chats/export${qs ? `?${qs}` : ''}`;

export { buildQs } from '@/lib/ai-quality/contract';
