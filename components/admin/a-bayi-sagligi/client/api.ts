'use client';

/**
 * Bayi Sağlığı — istemci veri katmanı. Zarf v2 çözülür; hata HİÇBİR ZAMAN boş liste gibi dönmez.
 */
import type { HealthFlag, HealthBand, HealthWindow, CsmPriority, CsmStatus } from '../domain';
import type { HealthListResult } from '../server/list';
import type { DealerHealthDetail } from '../server/detail';
import type { ApplyPreview, PlaybookLibrary } from '../server/playbooks';

export type { HealthListResult, DealerHealthDetail, ApplyPreview, PlaybookLibrary };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.ok === false || json.success === false) {
    const message =
      (json && typeof json.error === 'string' && json.error) ||
      (res.status === 401 || res.status === 403
        ? 'Bu işlem için yetkiniz yok.'
        : res.status >= 500
          ? 'Sunucu şu an yanıt veremiyor. Lütfen birazdan tekrar deneyin.'
          : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    throw new ApiRequestError(message, res.status, typeof json?.code === 'string' ? json.code : undefined, json?.details);
  }
  return (json.data ?? json) as T;
}

export interface ListParamsInput {
  window: HealthWindow;
  q?: string;
  band?: HealthBand | '';
  flag?: HealthFlag | '';
  sort?: string | null;
  page?: number;
  size?: number;
  fresh?: boolean;
}

export function listSearchParams(p: ListParamsInput, opts: { paging?: boolean } = { paging: true }): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('window', String(p.window));
  if (p.q) sp.set('q', p.q);
  if (p.band) sp.set('band', p.band);
  if (p.flag) sp.set('flag', p.flag);
  if (p.sort) sp.set('sort', p.sort);
  if (opts.paging !== false) {
    if (p.page && p.page > 1) sp.set('page', String(p.page));
    if (p.size) sp.set('size', String(p.size));
  }
  if (p.fresh) sp.set('fresh', '1');
  return sp;
}

export async function fetchHealthList(p: ListParamsInput, signal?: AbortSignal): Promise<HealthListResult> {
  const res = await fetch(`/api/admin/dealers-health?${listSearchParams(p)}`, { signal, cache: 'no-store' });
  return parse<HealthListResult>(res);
}

export function exportUrl(p: ListParamsInput): string {
  return `/api/admin/dealers-health/export?${listSearchParams(p, { paging: false })}`;
}

export async function fetchDealerDetail(dealerId: string, window: HealthWindow, signal?: AbortSignal): Promise<DealerHealthDetail> {
  const res = await fetch(`/api/admin/dealers-health/${encodeURIComponent(dealerId)}?window=${window}`, { signal, cache: 'no-store' });
  return parse<DealerHealthDetail>(res);
}

export async function fetchPlaybookLibrary(signal?: AbortSignal): Promise<PlaybookLibrary> {
  const res = await fetch('/api/admin/playbooks', { signal, cache: 'no-store' });
  return parse<PlaybookLibrary>(res);
}

function idemKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

async function postJson<T>(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST', idempotencyKey?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

export function previewPlaybook(playbookId: string, dealerId: string): Promise<{ preview: ApplyPreview }> {
  return postJson('/api/admin/playbooks/apply', { playbookId, dealerId, dryRun: true });
}

export function applyPlaybook(playbookId: string, dealerId: string, key = idemKey()): Promise<{ campaignId: string; title: string }> {
  return postJson('/api/admin/playbooks/apply', { playbookId, dealerId }, 'POST', key);
}

export function createCsmTask(
  dealerId: string,
  body: { priority: CsmPriority; note: string; dueAt?: string | null; assignToMe?: boolean; window: HealthWindow },
  key = idemKey()
): Promise<{ task: { id: string } }> {
  return postJson(`/api/admin/dealers-health/${encodeURIComponent(dealerId)}/csm-tasks`, body, 'POST', key);
}

export function updateCsmTask(
  taskId: string,
  body: { status?: CsmStatus; assignToMe?: boolean; expectedStatus?: CsmStatus }
): Promise<{ task: { id: string; status: string } }> {
  return postJson(`/api/admin/dealers-health/csm-tasks/${encodeURIComponent(taskId)}`, body, 'PATCH');
}
