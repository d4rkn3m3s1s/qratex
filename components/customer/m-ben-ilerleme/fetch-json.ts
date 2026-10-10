/**
 * Zarf v2 okuyucu (istemci). Başarısız yanıtı `status` + `code` taşıyan hataya çevirir;
 * `QueryState` bunu forbidden / moduleDisabled / offline / generic olarak ayırır.
 * (Eski journey/analytics sayfaları `res.ok`'a bakmadan hata gövdesini veri sanıyordu.)
 */
export class EnvelopeError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string, retryable = false) {
    super(message);
    this.name = 'EnvelopeError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export async function fetchEnvelope<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' }, signal });
  let body: { success?: boolean; data?: unknown; error?: unknown; code?: unknown; retryable?: unknown } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    const message = typeof body?.error === 'string' && body.error ? body.error : `İstek başarısız (${res.status})`;
    throw new EnvelopeError(message, res.status, typeof body?.code === 'string' ? body.code : '', body?.retryable === true);
  }
  return body.data as T;
}
