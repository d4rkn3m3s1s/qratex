/**
 * İstemci: zarf v2 okuyucu + kampanya uçları + React Query anahtarları.
 * Hata gövdesi veri sanılmaz (`res.ok` + `success`), JSON olmayan 5xx "Unexpected token"
 * yerine okunur Türkçe hataya döner (denetim Bulgu 4 / performans Bulgu 5).
 */
import type { CampaignSegmentKey, ListTab } from '../domain';
import type {
  AudienceOverview,
  CampaignDto,
  CampaignListResult,
  CampaignPerformance,
  CampaignSummary,
  SendPreview,
} from '../types';

export class CampaignApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = 'CampaignApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope = { success?: boolean; data?: unknown; error?: unknown; code?: unknown; details?: unknown };

async function readEnvelope<T>(res: Response): Promise<T> {
  let body: Envelope | null = null;
  try {
    body = (await res.json()) as Envelope;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    const message =
      typeof body?.error === 'string' && body.error
        ? body.error
        : res.status >= 500
          ? 'Sunucuya şu an ulaşılamıyor. Birazdan tekrar deneyin.'
          : `İstek başarısız (${res.status})`;
    throw new CampaignApiError(message, res.status, typeof body?.code === 'string' ? body.code : '', body?.details);
  }
  return body.data as T;
}

/** ADMIN salt-okunur görünümü için `?dealerId=` her isteğe eklenir. */
function withDealer(path: string, dealerId: string | null, extra?: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(extra ?? {})) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  if (dealerId) sp.set('dealerId', dealerId);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal });
  return readEnvelope<T>(res);
}

function idempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

async function sendJson<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, idempotent = false): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotent) headers['idempotency-key'] = idempotencyKey();
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readEnvelope<T>(res);
}

export interface ListQuery {
  tab: ListTab;
  q: string;
  segment: CampaignSegmentKey | null;
  page: number;
}

export const campaignKeys = {
  root: (dealerId: string | null) => ['dealer', 'campaigns', dealerId ?? 'self'] as const,
  list: (dealerId: string | null, q: ListQuery) => [...campaignKeys.root(dealerId), 'list', q.tab, q.q, q.segment ?? '', q.page] as const,
  summary: (dealerId: string | null) => [...campaignKeys.root(dealerId), 'summary'] as const,
  audience: (dealerId: string | null) => [...campaignKeys.root(dealerId), 'audience'] as const,
  preview: (dealerId: string | null, id: string, holdout: number) => [...campaignKeys.root(dealerId), 'preview', id, holdout] as const,
  performance: (dealerId: string | null, id: string, window: number) => [...campaignKeys.root(dealerId), 'performance', id, window] as const,
};

const BASE = '/api/dealer/campaigns';

export const campaignApi = {
  list: (dealerId: string | null, q: ListQuery, signal?: AbortSignal) =>
    getJson<CampaignListResult>(withDealer(BASE, dealerId, { tab: q.tab, q: q.q, segment: q.segment, page: q.page }), signal),
  get: (dealerId: string | null, id: string, signal?: AbortSignal) =>
    getJson<{ campaign: CampaignDto }>(withDealer(`${BASE}/${encodeURIComponent(id)}`, dealerId), signal),
  summary: (dealerId: string | null, signal?: AbortSignal) => getJson<CampaignSummary>(withDealer(`${BASE}/summary`, dealerId), signal),
  audience: (dealerId: string | null, signal?: AbortSignal) => getJson<AudienceOverview>(withDealer(`${BASE}/audience`, dealerId), signal),
  preview: (dealerId: string | null, id: string, holdout: number, signal?: AbortSignal) =>
    getJson<SendPreview>(withDealer(`${BASE}/${encodeURIComponent(id)}/preview`, dealerId, { holdout }), signal),
  performance: (dealerId: string | null, id: string, window: number, signal?: AbortSignal) =>
    getJson<CampaignPerformance>(withDealer(`${BASE}/${encodeURIComponent(id)}/performance`, dealerId, { window }), signal),
  create: (input: { title: string; message: string; targetSegment: CampaignSegmentKey }) =>
    sendJson<{ campaign: CampaignDto }>(BASE, 'POST', { ...input, channel: 'notification' }, true),
  update: (id: string, input: { title: string; message: string; targetSegment: CampaignSegmentKey }) =>
    sendJson<{ campaign: CampaignDto }>(`${BASE}/${encodeURIComponent(id)}`, 'PATCH', input),
  remove: (id: string) => sendJson<{ deleted: true }>(`${BASE}/${encodeURIComponent(id)}`, 'DELETE'),
  send: (id: string, holdoutPct: number) =>
    sendJson<{ recipientCount: number; sentAt: string }>(`${BASE}/${encodeURIComponent(id)}/send`, 'POST', { holdoutPct }, true),
  schedule: (id: string, day: string, holdoutPct: number) =>
    sendJson<{ scheduledFor: string; day: string }>(`${BASE}/${encodeURIComponent(id)}/schedule`, 'POST', { day, holdoutPct }),
  unschedule: (id: string) => sendJson<{ cancelled: true }>(`${BASE}/${encodeURIComponent(id)}/schedule`, 'DELETE'),
  archive: (id: string, archived: boolean) =>
    sendJson<{ campaign: CampaignDto }>(`${BASE}/${encodeURIComponent(id)}/archive`, 'POST', { archived }),
  duplicate: (id: string, suffix: '(kopya)' | '(copy)') =>
    sendJson<{ campaign: CampaignDto }>(`${BASE}/${encodeURIComponent(id)}/duplicate`, 'POST', { suffix }, true),
};
