'use client';

/**
 * Gelen Kutusu istemci veri katmanı: zarf v2 okuyucu, sorgu anahtarları, fetch'ler, sığ URL
 * durumu (sunucu bileşeni filtre değişiminde yeniden çalışmaz) ve biçimleyiciler.
 * Hata kodlu fırlatılır → `QueryState` doğru ekranı seçer; "200 + sıfırlar" yok.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  InboxAction,
  InboxDetail,
  InboxFilters,
  InboxListPage,
  InboxMeta,
  InboxReplyResult,
  InboxSuggestResult,
  InboxSummary,
} from '@/lib/dealer-inbox/types';

export class InboxFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(message: string, status: number, code: string | null, details: unknown = null) {
    super(message);
    this.name = 'InboxFetchError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown };

async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new InboxFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null, json?.details ?? null);
  }
  return json.data as T;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  return readEnvelope<T>(res);
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  return readEnvelope<T>(res);
}

/** 4xx (429 hariç) yeniden denenmez; ağ/5xx en fazla 2 kez. */
export function shouldRetry(count: number, error: unknown): boolean {
  if (error instanceof InboxFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
}

export function filtersToQuery(f: InboxFilters, extra: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams();
  const put = (k: string, v: string | null | undefined, def?: string) => {
    if (v != null && v !== '' && v !== def) sp.set(k, v);
  };
  put('source', f.source, 'all');
  sp.set('status', f.status);
  put('rating', f.rating, 'all');
  put('sentiment', f.sentiment, 'all');
  put('signal', f.signal, 'all');
  put('assigned', f.assigned, 'all');
  put('range', f.range, 'all');
  put('qr', f.qr);
  put('q', f.q);
  put('sort', f.sort, 'newest');
  for (const [k, v] of Object.entries(extra)) put(k, v);
  return sp.toString();
}

export const inboxKeys = {
  all: ['dealer-inbox'] as const,
  list: (f: InboxFilters) => ['dealer-inbox', 'list', f] as const,
  summary: (from: string, to: string) => ['dealer-inbox', 'summary', from, to] as const,
  meta: ['dealer-inbox', 'meta'] as const,
  detail: (key: string) => ['dealer-inbox', 'detail', key] as const,
};

export function fetchListPage(f: InboxFilters, cursor: string | null, signal?: AbortSignal) {
  return getJson<InboxListPage>(`/api/dealer/inbox?${filtersToQuery(f, { cursor })}`, signal);
}

export function fetchSummary(from: string, to: string, signal?: AbortSignal) {
  return getJson<InboxSummary>(`/api/dealer/inbox/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, signal);
}

export function fetchMeta(signal?: AbortSignal) {
  return getJson<InboxMeta>('/api/dealer/inbox/meta', signal);
}

export function fetchDetail(key: string, signal?: AbortSignal) {
  return getJson<InboxDetail>(`/api/dealer/inbox/${encodeURIComponent(key)}`, signal);
}

export function postReply(key: string, reply: string, expectedReply: string | null) {
  return postJson<InboxReplyResult>(`/api/dealer/inbox/${encodeURIComponent(key)}/reply`, { reply, expectedReply });
}

export function postSuggest(key: string) {
  return postJson<InboxSuggestResult>(`/api/dealer/inbox/${encodeURIComponent(key)}/suggest`, {});
}

export type ActionResponse = { results: Array<{ key: string; ok: boolean; error?: string }>; okCount: number; failCount: number };

export function postAction(keys: string[], action: InboxAction, assigneeId?: string | null) {
  return postJson<ActionResponse>('/api/dealer/inbox/actions', { keys, action, ...(assigneeId !== undefined ? { assigneeId } : {}) });
}

function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Telafi: mevcut kaynak uçları (tek servis `createRemedyOffer`; 400/409/422 dürüst). */
export function postRemedy(key: string, message: string, queueForApproval: boolean) {
  const [prefix, id] = [key.slice(0, 2), key.slice(3)];
  const url =
    prefix === 'qr'
      ? `/api/dealer/feedbacks/${encodeURIComponent(id)}/remedy`
      : `/api/dealer/consumption-reviews/${encodeURIComponent(id)}/remedy`;
  return postJson<{ status: string; queuedForApproval: boolean; remedyOfferId: string }>(
    url,
    { ...(message.trim() ? { message: message.trim() } : {}), queueForApproval, sendNotification: !queueForApproval },
    { 'Idempotency-Key': newIdempotencyKey() }
  );
}

export async function downloadExport(f: InboxFilters): Promise<{ rows: number; truncated: boolean }> {
  const res = await fetch(`/api/dealer/inbox/export?${filtersToQuery(f)}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as Envelope<unknown> | null;
    throw new InboxFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null);
  }
  const rows = Number(res.headers.get('x-export-rows') ?? '0');
  const truncated = res.headers.get('x-export-truncated') === 'true';
  if (rows > 0) {
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'gelen-kutusu.csv';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { rows, truncated };
}

/* ───────────────────────── Sığ URL durumu ───────────────────────── */

/**
 * URL sorgusunu okur/yazar; yazım `history.replaceState` ile yapılır (Next `useSearchParams`
 * güncellenir, sunucu bileşeni yeniden çalışmaz). Böylece filtre değişimi tek bir API isteğidir.
 */
export function useShallowParams() {
  const sp = useSearchParams();
  const current = sp?.toString() ?? '';
  const params = useMemo(() => new URLSearchParams(current), [current]);

  const set = useCallback((patch: Record<string, string | null | undefined>, mode: 'replace' | 'push' = 'replace') => {
    if (typeof window === 'undefined') return;
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, []);

  return { params, set };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ───────────────────────── Biçim ───────────────────────── */

const TZ = 'Europe/Istanbul';

export function formatDateTime(iso: string | null | undefined, locale: 'tr' | 'en'): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDay(iso: string | null | undefined, locale: 'tr' | 'en'): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso)
  );
}

/** Göreli zaman ("3 sa önce" / "3 h ago"), dile duyarlı. */
export function formatRelative(iso: string, locale: 'tr' | 'en', now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'tr', { numeric: 'auto', style: 'short' });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return formatDay(iso, locale);
}

export function formatCurrencyTRY(amount: number, locale: 'tr' | 'en'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

export function formatPercent(v: number, locale: 'tr' | 'en'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { style: 'percent', maximumFractionDigits: 0 }).format(v);
}
