'use client';

/**
 * Cüzdan BFF uçlarının istemci sarmalayıcısı. Zarf v2'yi açar; hata `code` ile fırlar
 * (ekran `useWalletCopy().errors[code]` ile çevirir — "200 + sıfır" yok, sessiz yutma yok).
 */
export class WalletApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'WalletApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: { success?: boolean; data?: T; code?: string; error?: string; details?: unknown } | null = null;
  try {
    json = await res.json();
  } catch {
    /* gövdesiz */
  }
  if (!res.ok || !json || json.success === false) {
    throw new WalletApiError(res.status, json?.code ?? (res.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'), json?.error ?? '', json?.details);
  }
  return json.data as T;
}

export async function walletPost<T>(url: string, body?: unknown, opts: { idempotencyKey?: string | boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = typeof opts.idempotencyKey === 'string' ? opts.idempotencyKey : newKey();
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new WalletApiError(0, 'NETWORK', '');
  }
  return parse<T>(res);
}

export async function walletGet<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new WalletApiError(0, 'NETWORK', '');
  }
  return parse<T>(res);
}

export { newKey as newIdempotencyKey };

/** Hata → kullanıcı metni (çeviri tablosu, yoksa sunucunun Türkçe mesajı, o da yoksa genel). */
export function errorText(err: unknown, errors: Record<string, string>): string {
  if (err instanceof WalletApiError) {
    if (err.code === 'NETWORK') return errors.network;
    return errors[err.code] ?? (err.message || errors.generic);
  }
  return errors.generic;
}
