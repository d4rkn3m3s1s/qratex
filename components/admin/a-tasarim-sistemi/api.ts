'use client';

import type { ThemeDraft } from '@/lib/design-system/theme-model';
import type { ThemeHistoryItem, ThemeOverview } from '@/lib/design-system/theme.server';
import type { ChecklistData, PrefsSummary } from '@/lib/design-system/a11y.server';
import type { CheckStatus } from '@/lib/design-system/a11y-checklist';
import type { ThemeSettingRow } from '@/lib/theme-settings-keys';
import { clientMessage, requestFailedStatus } from '@/lib/client-messages';

/** Zarf v2 hatası (`status` QueryState tarafından okunur: 403 → yetkisiz, 409 → çakışma). */
export class DsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.name = 'DsApiError';
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; message?: string; code?: string };

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, body, headers });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new DsApiError(0, clientMessage('network'), 'NETWORK');
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (parsed && typeof parsed === 'object' ? parsed : {}) as Envelope<T>;
  if (!res.ok || env.ok === false || env.success === false) {
    throw new DsApiError(res.status, env.error || env.message || requestFailedStatus(res.status), env.code ?? null);
  }
  return env.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : clientMessage('unexpected'));
export const isConflict = (e: unknown) => e instanceof DsApiError && e.status === 409;

const BASE = '/api/admin/design-system';

export const dsKeys = {
  theme: ['admin-design-system', 'theme'] as const,
  history: (page: number) => ['admin-design-system', 'theme-history', page] as const,
  a11y: ['admin-design-system', 'a11y'] as const,
};

export type PublishResult = { entries: ThemeSettingRow[]; version: string | null };

export const fetchTheme = (signal?: AbortSignal) => call<ThemeOverview>(`${BASE}/theme`, { signal });
export const fetchHistory = (page: number, signal?: AbortSignal) =>
  call<{ items: ThemeHistoryItem[]; total: number; page: number; size: number }>(`${BASE}/theme/history?page=${page}&size=10`, { signal });
export const publishTheme = (draft: ThemeDraft, baseVersion: string | null, note?: string) =>
  call<PublishResult>(`${BASE}/theme`, { method: 'PUT', json: { draft, baseVersion, ...(note ? { note } : {}) } });
export const rollbackTheme = (auditId: string, baseVersion: string | null) =>
  call<PublishResult>(`${BASE}/theme/rollback`, { method: 'POST', json: { auditId, baseVersion } });

export const fetchA11y = (signal?: AbortSignal) => call<{ prefs: PrefsSummary; checklist: ChecklistData }>(`${BASE}/a11y`, { signal });
export const patchChecklist = (body: { id: string; status: CheckStatus; note?: string; baseVersion: string | null }) =>
  call<ChecklistData>(`${BASE}/a11y/checklist`, { method: 'PATCH', json: body });

/** Platform sağlayıcısına yeni satırları ikinci okuma yapmadan ilet (components/providers.tsx). */
export function broadcastPublished(entries: ThemeSettingRow[]) {
  window.dispatchEvent(new CustomEvent('qratex:theme-palette-changed', { detail: { entries } }));
}

export function formatIstanbul(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  try {
    return new Intl.DateTimeFormat('tr-TR', { ...opts, timeZone: 'Europe/Istanbul' }).format(new Date(iso));
  } catch {
    return iso;
  }
}
