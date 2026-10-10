'use client';

import type { QrCreateInput, QrLifecycleAction, QrListFilters, QrUpdateBody } from '@/lib/dealer/qr-codes/rules';
import { filtersToSearchParams } from '@/lib/dealer/qr-codes/rules';
import type { LocationsDto, QrDetailDto, QrListDto, QrSummaryDto } from '@/lib/dealer/qr-codes/types';

/** Zarf v2 hatası — `QueryState` (`status`/`code`) ve form katmanı (`details`) aynı nesneyi okur. */
export class QrApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details?: unknown;
  readonly retryable: boolean;
  constructor(status: number, message: string, code: string | null, details: unknown, retryable: boolean) {
    super(message);
    this.name = 'QrApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

function idempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

async function qrFetch<T>(url: string, init?: RequestInit & { idempotent?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (init?.idempotent) headers['Idempotency-Key'] = idempotencyKey();
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* gövdesiz */
  }
  const env = (body && typeof body === 'object' ? body : {}) as {
    ok?: boolean;
    success?: boolean;
    data?: T;
    error?: string;
    code?: string;
    details?: unknown;
    retryable?: boolean;
  };
  if (!res.ok || env.success === false || env.ok === false) {
    throw new QrApiError(res.status || 500, env.error || 'İstek tamamlanamadı.', env.code ?? null, env.details, env.retryable === true);
  }
  return env.data as T;
}

const BASE = '/api/dealer/qr-codes';

export function fetchQrList(f: QrListFilters, signal?: AbortSignal): Promise<QrListDto> {
  const qs = filtersToSearchParams(f).toString();
  return qrFetch(`${BASE}${qs ? `?${qs}` : ''}`, { signal });
}

export function fetchQrSummary(signal?: AbortSignal): Promise<QrSummaryDto> {
  return qrFetch(`${BASE}/summary`, { signal });
}

export function fetchQrDetail(id: string, signal?: AbortSignal): Promise<QrDetailDto> {
  return qrFetch(`${BASE}/${encodeURIComponent(id)}`, { signal });
}

export function fetchLocations(signal?: AbortSignal): Promise<LocationsDto> {
  return qrFetch(`${BASE}/locations`, { signal });
}

export function createQr(input: QrCreateInput): Promise<{ created: Array<{ id: string; code: string; name: string }> }> {
  return qrFetch(BASE, { method: 'POST', body: JSON.stringify(input), idempotent: true });
}

export function updateQr(id: string, input: QrUpdateBody): Promise<{ id: string }> {
  return qrFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function qrLifecycle(
  id: string,
  action: QrLifecycleAction
): Promise<{ id: string; action: QrLifecycleAction; changed: boolean; replacedId?: string }> {
  return qrFetch(`${BASE}/${encodeURIComponent(id)}/lifecycle`, { method: 'POST', body: JSON.stringify({ action }) });
}

export function bulkQr(action: 'activate' | 'deactivate', ids: string[]): Promise<{ count: number; skipped: number }> {
  return qrFetch(`${BASE}/bulk`, { method: 'POST', body: JSON.stringify({ action, ids }) });
}

export function createLocation(input: { name: string; address: string | null }): Promise<{ id: string }> {
  return qrFetch(`${BASE}/locations`, { method: 'POST', body: JSON.stringify(input), idempotent: true });
}

export function updateLocation(
  id: string,
  input: { action: 'archive' | 'restore' } | { name?: string; address?: string | null }
): Promise<{ id: string; changed: boolean }> {
  return qrFetch(`${BASE}/locations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export interface PrintParams {
  ids: string[];
  template: string;
  format: 'svg' | 'pdf';
  fg: string;
  bg: string;
  cta?: string;
  link?: string | null;
  download?: boolean;
}

export function printUrl(p: PrintParams): string {
  const sp = new URLSearchParams({ ids: p.ids.join(','), template: p.template, format: p.format, fg: p.fg, bg: p.bg });
  if (p.cta?.trim()) sp.set('cta', p.cta.trim());
  if (p.link) sp.set('link', p.link);
  if (p.download) sp.set('download', '1');
  return `${BASE}/print?${sp.toString()}`;
}

/** Baskı dosyasını indir (hata zarfını görünür kılmak için önce fetch, sonra blob). */
export async function downloadPrint(p: PrintParams, filename: string): Promise<void> {
  const res = await fetch(printUrl({ ...p, download: true }), { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    let msg = 'Dosya hazırlanamadı.';
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* gövdesiz */
    }
    throw new QrApiError(res.status, msg, null, null, res.status >= 500);
  }
  saveBlob(await res.blob(), filename);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Hemen iptal etmek bazı tarayıcılarda indirmeyi kesebilir (rapor #48).
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Sunucu SVG'sini PNG'ye çevirir (yaklaşık 300 dpi, en çok 2400 px). */
export async function downloadPng(p: PrintParams, filename: string): Promise<void> {
  const res = await fetch(printUrl({ ...p, format: 'svg' }), { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new QrApiError(res.status, 'Görsel hazırlanamadı.', null, null, true);
  const svg = await res.text();
  const mm = /width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg);
  const wMm = mm ? Number(mm[1]) : 60;
  const hMm = mm ? Number(mm[2]) : 60;
  const scale = Math.min(300 / 25.4, 2400 / Math.max(wMm, hMm));
  const w = Math.round(wMm * scale);
  const h = Math.round(hMm * scale);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('png');
    saveBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
