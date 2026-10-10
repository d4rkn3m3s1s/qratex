'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CustomerRemedyListItem, VoiceDetail, VoiceListPage, VoiceSummary } from '@/lib/customer-voices/types';
import type { VoicesLocale } from './copy';

/* ───────────────────────── Biçim (Europe/Istanbul) ───────────────────────── */

const TZ = 'Europe/Istanbul';
const tag = (l: VoicesLocale) => (l === 'en' ? 'en-GB' : 'tr-TR');

export function formatDate(iso: string, l: VoicesLocale): string {
  return new Intl.DateTimeFormat(tag(l), { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
}

export function formatDateTime(iso: string, l: VoicesLocale): string {
  return new Intl.DateTimeFormat(tag(l), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso));
}

/** "Ekim 2026" — liste ay başlığı. */
export function formatMonth(iso: string, l: VoicesLocale): string {
  return new Intl.DateTimeFormat(tag(l), { month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
}

export function monthKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: TZ }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${y}-${m}`;
}

export function formatRelative(iso: string, l: VoicesLocale, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(tag(l), { numeric: 'auto' });
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (abs < MIN) return rtf.format(0, 'minute');
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  return formatDate(iso, l);
}

export function formatNumber(n: number, l: VoicesLocale, digits = 0): string {
  return new Intl.NumberFormat(tag(l), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function formatMoney(n: number, l: VoicesLocale): string {
  return new Intl.NumberFormat(tag(l), { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);
}

/** Kısa referans (kasada okunur): teklif kimliğinin son 6 karakteri. */
export function shortRef(id: string): string {
  return id.slice(-6).toUpperCase();
}

/* ───────────────────────── Ağ ───────────────────────── */

export class VoicesApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(message: string, status: number, code: string | null, details?: unknown) {
    super(message);
    this.name = 'VoicesApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Zarf v2 okuyucu: `!ok` ya da JSON olmayan gövde ASLA boş veri gibi dönmez, hata fırlatır. */
export async function fetchJson<T>(input: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new VoicesApiError('Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.', 0, 'NETWORK');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const env = (body ?? {}) as { ok?: boolean; success?: boolean; data?: unknown; error?: string; message?: string; code?: string; details?: unknown };
  if (!res.ok || env.success === false) {
    const msg = env.error || env.message || (res.status === 401 ? 'Oturumun sona ermiş. Lütfen yeniden giriş yap.' : 'İşlem tamamlanamadı. Lütfen tekrar dene.');
    throw new VoicesApiError(msg, res.status, env.code ?? null, env.details);
  }
  return (env.data ?? body) as T;
}

export const voicesKeys = {
  all: ['customer', 'voices'] as const,
  summary: () => ['customer', 'voices', 'summary'] as const,
  list: (f: VoiceFilters) => ['customer', 'voices', 'list', f.type, f.status, f.q] as const,
  detail: (key: string) => ['customer', 'voices', 'detail', key] as const,
  remedies: () => ['customer', 'voices', 'remedies'] as const,
  offer: (id: string) => ['customer', 'voices', 'offer', id] as const,
};

export type VoiceFilters = { type: string; status: string; q: string };

export function listUrl(f: VoiceFilters, cursor: string | null): string {
  const sp = new URLSearchParams();
  if (f.type !== 'all') sp.set('type', f.type);
  if (f.status !== 'all') sp.set('status', f.status);
  if (f.q) sp.set('q', f.q);
  if (cursor) sp.set('cursor', cursor);
  const qs = sp.toString();
  return `/api/customer/voices${qs ? `?${qs}` : ''}`;
}

export const fetchSummary = (signal?: AbortSignal) => fetchJson<VoiceSummary>('/api/customer/voices/summary', { signal });
export const fetchListPage = (f: VoiceFilters, cursor: string | null, signal?: AbortSignal) =>
  fetchJson<VoiceListPage>(listUrl(f, cursor), { signal });
export const fetchDetail = (key: string, signal?: AbortSignal) =>
  fetchJson<VoiceDetail>(`/api/customer/voices/${encodeURIComponent(key)}`, { signal });
export const fetchRemedies = (signal?: AbortSignal) =>
  fetchJson<{ offers: CustomerRemedyListItem[]; hasMore: boolean }>('/api/customer/remedy', { signal });

/* ───────────────────────── Sığ URL durumu ───────────────────────── */

/**
 * URL durumu (filtre, `?id=` çekmece, `?offer=` telafi) — Next 16'nın yerel History API
 * entegrasyonuyla SIĞ yazılır: `useSearchParams` güncellenir ama sunucu bileşeni yeniden
 * render edilmez (her filtrede/çekmece açılışında DB'ye gidilmez). Paylaşılabilir link, geri
 * tuşu (`push`) ve yenileme sonrası aynı görünüm korunur.
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

/** Gecikmeli değer (arama kutusu → URL/sorgu). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ───────────────────────── Görülme (cihaz başına kolaylık) ───────────────────────── */

const SEEN_KEY = 'qx-voices-seen-at';

/**
 * "Yeni yanıt" işareti için son ziyaret anı. Yalnız bu tarayıcıda tutulan bir kolaylıktır;
 * okunamazsa (gizli pencere vb.) hiçbir şey işaretlenmez — sayfa yine doğru çalışır.
 */
export function useLastSeen(): number | null {
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    let prev: number | null = null;
    try {
      const raw = window.localStorage.getItem(SEEN_KEY);
      prev = raw ? Number(raw) : null;
      if (prev !== null && !Number.isFinite(prev)) prev = null;
    } catch {
      prev = null;
    }
    setSeen(prev);
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(SEEN_KEY, String(Date.now()));
      } catch {
        /* depolama yok: işaret yalnız bu oturumda kalır */
      }
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  return seen;
}
