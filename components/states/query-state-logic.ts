/**
 * QueryState karar mantığı — saf fonksiyonlar (Jest ile test edilir).
 * "Hata = boş durum" (K5) yapısal olarak kapanır: hata, boş listeyle asla
 * aynı görünümü almaz; veri varken gelen hata veriyi silmez (stale).
 */

export type ErrorKind = 'generic' | 'offline' | 'forbidden' | 'moduleDisabled' | 'notFound';

export type QueryView =
  | { kind: 'loading' }
  | { kind: 'error'; errorKind: ErrorKind }
  | { kind: 'empty' }
  | { kind: 'ready'; stale: boolean; refreshing: boolean; staleErrorKind?: ErrorKind };

/** TanStack Query sonucu ya da elle verilen alanlar (ördek tipleme; kütüphane bağımlılığı yok). */
export type QueryLike<T> = {
  data?: T | null;
  error?: unknown;
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  isRefetching?: boolean;
  refetch?: () => unknown;
};

function readNumber(obj: unknown, key: string): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : undefined;
}

function readString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Hatayı türüne ayırır. Tanınan biçimler:
 *  - `{ status: 401|403 }` → forbidden, `{ status: 404 }` → notFound
 *  - `{ code: 'MODULE_DISABLED' | 'FEATURE_DISABLED' }` ya da status 423 → moduleDisabled
 *  - `{ code: 'FORBIDDEN' | 'UNAUTHORIZED' | 'NOT_FOUND' }`
 *  - ağ hatası (`TypeError: Failed to fetch`, `offline`) ya da `navigator.onLine === false` → offline
 * `cause` / `response` içine de bakar.
 */
export function classifyError(error: unknown, online: boolean = true): ErrorKind {
  if (!online) return 'offline';
  if (error == null) return 'generic';
  const candidates = [error, (error as { cause?: unknown })?.cause, (error as { response?: unknown })?.response];
  for (const c of candidates) {
    const status = readNumber(c, 'status') ?? readNumber(c, 'statusCode');
    const code = (readString(c, 'code') ?? '').toUpperCase();
    if (code === 'MODULE_DISABLED' || code === 'FEATURE_DISABLED' || status === 423) return 'moduleDisabled';
    if (status === 401 || status === 403 || code === 'FORBIDDEN' || code === 'UNAUTHORIZED') return 'forbidden';
    if (status === 404 || code === 'NOT_FOUND') return 'notFound';
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const name = error instanceof Error ? error.name : '';
  if (/failed to fetch|networkerror|network request failed|load failed|offline/i.test(message) || name === 'NetworkError') {
    return 'offline';
  }
  return 'generic';
}

/** Varsayılan boşluk testi: null/undefined, boş dizi, `items|rows|data` alanı boş dizi olan nesne. */
export function defaultIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    for (const key of ['items', 'rows', 'data', 'results']) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v.length === 0;
    }
  }
  return false;
}

export function resolveQueryView<T>(
  q: QueryLike<T>,
  opts: { isEmpty?: (data: T) => boolean; online?: boolean } = {},
): QueryView {
  const hasData = q.data !== undefined && q.data !== null;
  // TanStack v5: devre dışı sorgu `isPending: true, isLoading: false` olur → yükleniyor DEĞİL.
  const loading = q.isLoading !== undefined ? !!q.isLoading : !!q.isPending;
  const errored = !!(q.isError || (q.error != null && q.error !== false));
  const errorKind = errored ? classifyError(q.error, opts.online ?? true) : undefined;

  if (hasData) {
    const empty = (opts.isEmpty ?? (defaultIsEmpty as (d: T) => boolean))(q.data as T);
    // Veri varken gelen hata veriyi silmez: "son yüklenen veri" + uyarı.
    if (errored) {
      return empty ? { kind: 'error', errorKind: errorKind! } : { kind: 'ready', stale: true, refreshing: false, staleErrorKind: errorKind };
    }
    if (empty) return { kind: 'empty' };
    return { kind: 'ready', stale: false, refreshing: !!(q.isFetching || q.isRefetching) };
  }
  if (errored) return { kind: 'error', errorKind: errorKind! };
  if (loading) return { kind: 'loading' };
  // Ne veri ne hata ne yükleme → henüz istek atılmadı ya da veri gerçekten yok.
  return { kind: 'empty' };
}
