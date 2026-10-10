/**
 * Klan hata yardımcıları — `ApiError` (zarf v2) ile kodlu hata. İstemci `code`'u
 * `SQUAD_ERROR_MESSAGES[locale]` üzerinden çevirir; `error` alanı Türkçe kalır (geri uyum).
 */
import { ApiError } from '@/lib/http/define-route';
import { SQUAD_ERROR_MESSAGES, SQUAD_ERROR_STATUS, type SquadErrorCode } from './rules';

export function squadError(code: SquadErrorCode, message?: string): ApiError {
  return new ApiError(code, message ?? SQUAD_ERROR_MESSAGES.tr[code], { status: SQUAD_ERROR_STATUS[code] });
}

/** Prisma benzersizlik ihlali mi (P2002)? İsteğe bağlı: hangi alan. */
export function uniqueViolationTarget(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return null;
  const t = e.meta?.target;
  return Array.isArray(t) ? t.map(String).join(',') : String(t ?? '');
}
