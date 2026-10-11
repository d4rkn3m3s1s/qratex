'use client';

import type {
  QuestActionInput,
  QuestActionResult,
  QuestCreateInput,
  QuestDetail,
  QuestListPage,
  QuestOptions,
  QuestStats,
  QuestStatus,
  QuestUpdateInput,
} from '@/lib/admin-quests/contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar (`details`) aynı nesneyi okur. */
export class QuestsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'QuestsApiError';
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
    throw new QuestsApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.success === false || env.ok === false) {
    throw new QuestsApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details);
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

const BASE = '/api/admin/quests';
const enc = encodeURIComponent;

export const questsKeys = {
  all: ['admin-quests'] as const,
  stats: () => ['admin-quests', 'stats'] as const,
  list: (qs: string) => ['admin-quests', 'list', qs] as const,
  detail: (id: string) => ['admin-quests', 'detail', id] as const,
  options: () => ['admin-quests', 'options'] as const,
};

export const fetchStats = () => call<QuestStats>(`${BASE}/stats`);
export const fetchQuests = (qs: string, signal?: AbortSignal) => call<QuestListPage>(`${BASE}?${qs}`, { signal });
export const fetchQuest = (id: string) => call<QuestDetail>(`${BASE}/${enc(id)}`);
export const fetchOptions = () => call<QuestOptions>(`${BASE}/options`);

export const createQuest = (body: QuestCreateInput) =>
  call<{ id: string; status: QuestStatus }>(BASE, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });
export const updateQuest = (id: string, body: QuestUpdateInput) =>
  call<{ id: string; status: QuestStatus; updatedAt: string }>(`${BASE}/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const questAction = (id: string, body: QuestActionInput) =>
  call<QuestActionResult>(`${BASE}/${enc(id)}/actions`, { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idemKey() } });
export const addAchievements = () => call<{ created: number; ids: string[] }>(`${BASE}/achievements`, { method: 'POST', body: '{}' });
