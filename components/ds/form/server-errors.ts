import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * Sunucu hatasını forma yansıtma. API zarfı (lib/http/define-route.ts):
 *   { ok: false, error: '<Türkçe mesaj>', code, message, details?: [{ path, message }], requestId }
 * İstemci `ApiError` benzeri nesneler (`status`, `code`, `details`) ve `fetch` sonrası
 * çözülmüş JSON gövdesi de kabul edilir.
 */

export type ServerFieldError = { path: string; message: string };

export type ServerErrorInfo = {
  status?: number;
  code?: string;
  message: string;
  fieldErrors: ServerFieldError[];
  /** Eşzamanlı düzenleme çakışması (baseVersion uyuşmadı → 409). */
  conflict: boolean;
  requestId?: string;
};

/** Sürüm çakışması kodları. `INSUFFICIENT_POINTS` da 409 döner ama çakışma DEĞİLDİR. */
export const CONFLICT_CODES = new Set(['CONFLICT', 'VERSION_CONFLICT', 'STALE_VERSION', 'STALE_WRITE', 'BASE_VERSION_MISMATCH']);

/** Form köküne yazılan hata anahtarları (`errors.root.server`, `errors.root.conflict`). */
export const ROOT_SERVER = 'root.server' as const;
export const ROOT_CONFLICT = 'root.conflict' as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** Hata nesnesinin 409 sürüm çakışması olup olmadığı. */
export function isConflictError(error: unknown): boolean {
  const r = asRecord(error);
  if (!r) return false;
  const code = typeof r.code === 'string' ? r.code : undefined;
  const status = typeof r.status === 'number' ? r.status : undefined;
  if (code) return CONFLICT_CODES.has(code);
  return status === 409;
}

/** Herhangi bir hata biçimini tek yapıya indirger. */
export function readServerError(error: unknown, fallbackMessage = 'İşlem tamamlanamadı.'): ServerErrorInfo {
  const r = asRecord(error);
  // { error: { code, message } } biçimi de görülür
  const nested = r && asRecord(r.error);
  const src = nested && (nested.code || nested.message) ? { ...r, ...nested } : r;
  const status = src && typeof src.status === 'number' ? src.status : undefined;
  const code = src && typeof src.code === 'string' ? src.code : undefined;
  const messageCandidate =
    (src && typeof src.error === 'string' && src.error) ||
    (src && typeof src.message === 'string' && src.message) ||
    (error instanceof Error && error.message) ||
    (typeof error === 'string' && error) ||
    '';
  const fieldErrors: ServerFieldError[] = [];
  const details = src?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const dr = asRecord(d);
      if (dr && typeof dr.path === 'string' && dr.path && typeof dr.message === 'string') {
        fieldErrors.push({ path: dr.path, message: dr.message });
      }
    }
  }
  return {
    status,
    code,
    message: messageCandidate || fallbackMessage,
    fieldErrors,
    conflict: isConflictError(src ?? error),
    requestId: src && typeof src.requestId === 'string' ? src.requestId : undefined,
  };
}

/**
 * Sunucu hatasını forma uygular: alan hataları ilgili alana, genel mesaj `root.server`'a,
 * 409 sürüm çakışması `root.conflict`'e yazılır. İlk hatalı alana odaklanır.
 * Dönen bilgi çağıran tarafından toast vb. için kullanılabilir.
 */
export function applyServerErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
  error: unknown,
  fallbackMessage?: string,
): ServerErrorInfo {
  const info = readServerError(error, fallbackMessage);
  if (info.conflict) {
    form.setError(ROOT_CONFLICT, { type: '409', message: info.message });
    return info;
  }
  let focused = false;
  let appliedToField = false;
  for (const fe of info.fieldErrors) {
    // Yalnız formda var olan alanlara yaz (bilinmeyen yol sessizce köke düşer).
    const known = form.getValues(fe.path as FieldPath<T>) !== undefined;
    if (!known) continue;
    form.setError(fe.path as FieldPath<T>, { type: 'server', message: fe.message }, { shouldFocus: !focused });
    focused = true;
    appliedToField = true;
  }
  if (!appliedToField || info.fieldErrors.length === 0) {
    form.setError(ROOT_SERVER, { type: info.code ?? 'server', message: info.message });
  }
  return info;
}
