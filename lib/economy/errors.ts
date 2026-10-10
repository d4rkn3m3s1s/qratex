/**
 * Ekonomi servisinin hata tipi. `code` makine tarafından okunur (route'lar HTTP
 * durumuna çevirir); `message` kullanıcıya gösterilebilecek Türkçe metindir.
 *
 * Bilerek bağımlılıksız: lib/points-wallet.ts de bu dosyayı içe aktarır, döngü olmasın.
 */
export type EconomyErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_AMOUNT'
  | 'USER_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REASON_REQUIRED'
  | 'FORBIDDEN'
  | 'SELF_ADJUST_FORBIDDEN'
  | 'SECOND_APPROVAL_REQUIRED'
  | 'CAP_EXCEEDED';

/** Route katmanının önerilen HTTP karşılıkları. */
export const ECONOMY_ERROR_HTTP_STATUS: Readonly<Record<EconomyErrorCode, number>> = {
  INVALID_INPUT: 400,
  INVALID_AMOUNT: 400,
  USER_NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  REASON_REQUIRED: 400,
  FORBIDDEN: 403,
  SELF_ADJUST_FORBIDDEN: 403,
  SECOND_APPROVAL_REQUIRED: 428,
  CAP_EXCEEDED: 422,
};

export class EconomyError extends Error {
  readonly code: EconomyErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: EconomyErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EconomyError';
    this.code = code;
    this.details = details;
  }

  get httpStatus(): number {
    return ECONOMY_ERROR_HTTP_STATUS[this.code];
  }
}

export function isEconomyError(e: unknown): e is EconomyError {
  return e instanceof EconomyError;
}

/** Prisma unique ihlali (P2002) — `@prisma/client`'ı çalışma zamanında yüklemeden tanır. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}
