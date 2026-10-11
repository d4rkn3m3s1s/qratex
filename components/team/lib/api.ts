'use client';

import { readLocaleCookieClient } from '@/lib/locale-shared';

const isEn = () => readLocaleCookieClient() === 'en';
const OFFLINE_MSG = () => (isEn() ? 'Couldn’t connect. Check your internet connection and try again.' : 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
const FAILED_MSG = () => (isEn() ? 'Something went wrong. Please try again.' : 'İşlem tamamlanamadı. Lütfen tekrar dene.');

/**
 * Ekip modülü istemci veri katmanı. Tüm istekler buradan geçer (denetim O1/Bulgu 18: işlemler
 * `res.ok`'a bakmadan sessizce başarısız oluyordu). Hata, sunucunun Türkçe mesajı ve koduyla
 * fırlatılır; çağıran toast gösterir ve iyimser değişikliği geri alır.
 */

export class TeamApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'TeamApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown };

function firstDetailMessage(details: unknown): string | null {
  if (Array.isArray(details)) {
    const d = details.find((x) => x && typeof x === 'object' && typeof (x as { message?: unknown }).message === 'string');
    return d ? (d as { message: string }).message : null;
  }
  return null;
}

export async function teamFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(headers ?? {}) },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    throw new TeamApiError(0, 'OFFLINE', OFFLINE_MSG());
  }
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success === false) {
    const detail = firstDetailMessage(body?.details);
    const msg = body?.code === 'VALIDATION' && detail ? detail : body?.error || FAILED_MSG();
    throw new TeamApiError(res.status, body?.code ?? 'ERROR', msg, body?.details);
  }
  return (body.data ?? (body as unknown as T)) as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function errorMessage(err: unknown): string {
  if (err instanceof TeamApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return FAILED_MSG();
}
