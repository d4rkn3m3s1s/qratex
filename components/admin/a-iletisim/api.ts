'use client';

import type { InboxDetail, InboxListPage, InboxOverview, InboxView } from '@/lib/mail-center/inbox-contract';
import type { SendHistoryPage, SendOutcome, TemplateInput, TemplatesView } from '@/lib/mail-center/templates-contract';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve formlar aynı nesneyi okur. */
export class MailApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  constructor(status: number, message: string, code: string | null, details?: unknown) {
    super(message);
    this.name = 'MailApiError';
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
    res = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new MailApiError(0, 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.', 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new MailApiError(res.status, env.error || env.message || `İstek başarısız (${res.status}).`, env.code ?? null, env.details);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');

// ─────────────────────────── Gelen kutusu ───────────────────────────

const INBOX = '/api/admin/inbox';

export const inboxKeys = {
  all: ['admin-inbox'] as const,
  overview: () => ['admin-inbox', 'overview'] as const,
  list: (view: InboxView, q: string) => ['admin-inbox', 'list', view, q] as const,
  lists: () => ['admin-inbox', 'list'] as const,
  detail: (id: string) => ['admin-inbox', 'detail', id] as const,
};

export const fetchInboxOverview = (signal?: AbortSignal) => call<InboxOverview>(`${INBOX}/overview`, { signal });

export function fetchInboxList(view: InboxView, q: string, cursor: string | null, signal?: AbortSignal) {
  const qs = new URLSearchParams({ view });
  if (q) qs.set('q', q);
  if (cursor) qs.set('cursor', cursor);
  return call<InboxListPage>(`${INBOX}?${qs.toString()}`, { signal });
}

export const fetchInboxDetail = (id: string, signal?: AbortSignal) => call<InboxDetail>(`${INBOX}/${encodeURIComponent(id)}`, { signal });

export const patchInbox = (id: string, input: { seen?: boolean; archived?: boolean }) =>
  call<{ id: string; seen: boolean; mailbox: string }>(`${INBOX}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });

export const deleteInbox = (id: string) => call<{ id: string }>(`${INBOX}/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const syncInboxNow = () =>
  call<{ fetched: number; stored: number; matched: number; hasMore: boolean }>(`${INBOX}/sync`, { method: 'POST' });

export const replyInbox = (id: string, input: { message: string; quote: boolean }) =>
  call<{ sentId: string }>(`${INBOX}/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });

export const saveInboxRetention = (retentionDays: number | null) =>
  call<{ retentionDays: number | null }>(`${INBOX}/settings`, { method: 'PUT', body: JSON.stringify({ retentionDays }) });

export const mailBodyUrl = (id: string, images: boolean) => `${INBOX}/${encodeURIComponent(id)}/body${images ? '?images=1' : ''}`;
export const attachmentUrl = (id: string, index: number) => `${INBOX}/${encodeURIComponent(id)}/attachments/${index}`;

// ─────────────────────────── Şablonlar ───────────────────────────

const TPL = '/api/admin/intern-emails';

export const templateKeys = {
  view: () => ['admin-mail-templates'] as const,
  history: (id: string) => ['admin-mail-templates', 'history', id] as const,
};

export const fetchTemplatesView = (signal?: AbortSignal) => call<TemplatesView>(TPL, { signal });

export const saveTemplatesApi = (baseVersion: number, templates: TemplateInput[]) =>
  call<{ version: number; updatedAt: string }>(TPL, { method: 'PUT', body: JSON.stringify({ baseVersion, templates }) });

export const sendTemplateApi = (templateId: string, onlyNew: boolean, idempotencyKey: string, only?: string[]) =>
  call<SendOutcome & { remaining: number }>(TPL, {
    method: 'POST',
    body: JSON.stringify({ action: 'send', templateId, onlyNew, ...(only?.length ? { only } : {}) }),
    headers: { 'Idempotency-Key': idempotencyKey },
  });

export const sendTestApi = (template: TemplateInput, testTo: string) =>
  call<SendOutcome>(TPL, {
    method: 'POST',
    body: JSON.stringify({ action: 'test', template, testTo }),
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });

export const fetchSendHistory = (templateId: string, cursor: string | null, signal?: AbortSignal) => {
  const qs = new URLSearchParams({ templateId });
  if (cursor) qs.set('cursor', cursor);
  return call<SendHistoryPage>(`${TPL}/sends?${qs.toString()}`, { signal });
};

/** Önizleme HTML'i (zarf değil, düz HTML döner). */
export async function fetchPreviewHtml(template: Partial<TemplateInput>, sampleTo: string | undefined, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${TPL}/preview`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template, sampleTo }),
    signal,
  });
  if (!res.ok) {
    let msg = `Önizleme alınamadı (${res.status}).`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* düz metin */
    }
    throw new MailApiError(res.status, msg, null);
  }
  return res.text();
}
