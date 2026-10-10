/**
 * Görevler ekranının istemci uçları. Hata, durumu ve makine-okur kodu taşır (QueryState
 * `classifyError` ile 401/403/MODULE_DISABLED/çevrimdışı ayrımı yapar) — hata asla boş liste olmaz.
 */
import type { QuestBoard, QuestClaimResult } from './types';

export const QUEST_BOARD_QUERY_KEY = ['customer', 'quests', 'board'] as const;

export class QuestApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string, retryable = false) {
    super(message);
    this.name = 'QuestApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type Envelope<T> = { success?: boolean; ok?: boolean; data?: T; error?: string; code?: string; retryable?: boolean };

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body || body.success === false || body.data === undefined) {
    throw new QuestApiError(
      body?.error || 'İstek tamamlanamadı',
      res.status,
      body?.code || (res.ok ? 'BAD_RESPONSE' : `HTTP_${res.status}`),
      body?.retryable ?? res.status >= 500
    );
  }
  return body.data;
}

export async function fetchQuestBoard(signal?: AbortSignal): Promise<QuestBoard> {
  const res = await fetch('/api/customer/quests', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  return readEnvelope<QuestBoard>(res);
}

function idempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export async function postQuestClaim(input: { questId: string } | { all: true }): Promise<QuestClaimResult> {
  const res = await fetch('/api/customer/quests/claim', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(input),
  });
  return readEnvelope<QuestClaimResult>(res);
}

/** Sezon challenge ödülü — etkinlik ucunun mevcut sözleşmesi (`/api/customer/seasonal-event`). */
export async function postSeasonClaim(): Promise<{ points: number }> {
  const res = await fetch('/api/customer/seasonal-event', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = (await res.json().catch(() => null)) as
    | { success?: boolean; points?: number; data?: { points?: number }; error?: string; code?: string }
    | null;
  if (!res.ok || !body || body.success === false) {
    throw new QuestApiError(body?.error || 'Etkinlik ödülü alınamadı', res.status, body?.code || `HTTP_${res.status}`);
  }
  const points = typeof body.points === 'number' ? body.points : typeof body.data?.points === 'number' ? body.data.points : 0;
  return { points: Math.max(0, points) };
}
