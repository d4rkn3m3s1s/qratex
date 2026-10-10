'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Gelen Kutusu kuyrukları — istemci ağ ve URL yardımcıları.
 * Zarf v2: `!ok` ya da JSON olmayan gövde ASLA boş veri gibi dönmez; kodlu hata fırlatır
 * (QueryState hatayı "boş kuyruk" sanmaz — denetim B2 / bulgu 7 / bulgu 5).
 */

export class QueueApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(message: string, status: number, code: string | null, details?: unknown) {
    super(message);
    this.name = 'QueueApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope = { ok?: boolean; success?: boolean; data?: unknown; error?: string; message?: string; code?: string; details?: unknown };

export async function fetchJson<T>(input: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new QueueApiError('Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.', 0, 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const env = (body ?? {}) as Envelope;
  if (!res.ok || env.success === false || env.ok === false) {
    const msg =
      env.error ||
      env.message ||
      (res.status === 401 ? 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.' : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    throw new QueueApiError(msg, res.status, env.code ?? null, env.details);
  }
  return (env.data ?? body) as T;
}

export function sendJson<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

/** Hata mesajı (QueueApiError ise sunucunun Türkçe mesajı). */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof QueueApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Sığ URL durumu: Next 16 yerel History API entegrasyonuyla yazılır → `useSearchParams`
 * güncellenir ama sunucu bileşeni yeniden render edilmez (filtre/çekmece başına DB isteği yok).
 * Paylaşılabilir link, geri tuşu ve yenileme sonrası aynı görünüm korunur.
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

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Sorgu anahtarları (tek yerde; geçersiz kılma tutarlı olsun). */
export const queueKeys = {
  remedy: ['dealer', 'queues', 'remedy'] as const,
  remedyList: (view: string, source: string, q: string) => ['dealer', 'queues', 'remedy', 'list', view, source, q] as const,
  remedyDetail: (id: string) => ['dealer', 'queues', 'remedy', 'detail', id] as const,
  incidents: ['dealer', 'queues', 'incidents'] as const,
  incidentList: (view: string, severity: string, group: string, q: string, page: number) =>
    ['dealer', 'queues', 'incidents', 'list', view, severity, group, q, page] as const,
  incidentDetail: (id: string) => ['dealer', 'queues', 'incidents', 'detail', id] as const,
  radar: ['dealer', 'queues', 'radar'] as const,
  work: ['dealer', 'queues', 'work'] as const,
  workList: (scope: string, kind: string, q: string) => ['dealer', 'queues', 'work', 'list', scope, kind, q] as const,
  taskDetail: (id: string) => ['dealer', 'queues', 'work', 'task', id] as const,
  suggestions: ['dealer', 'queues', 'work', 'suggestions'] as const,
  assignees: ['dealer', 'queues', 'assignees'] as const,
};
