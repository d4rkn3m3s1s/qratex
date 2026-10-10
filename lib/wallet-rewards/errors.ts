/**
 * Cüzdan ödül işlemlerinin kodlu hataları. Route katmanı `ApiError`'a çevirir; istemci
 * `code` alanına göre çevrilmiş metin gösterir (sunucu mesajı Türkçe yedektir).
 */
export type WalletErrorCode =
  | 'REWARD_NOT_FOUND'
  | 'REWARD_UPCOMING'
  | 'REWARD_EXPIRED'
  | 'REWARD_LIMIT_REACHED'
  | 'REWARD_SOLD_OUT'
  | 'INSUFFICIENT_POINTS'
  | 'ALREADY_PROCESSED'
  | 'COSMETIC_NOT_FOUND'
  | 'PRICE_CHANGED'
  | 'ALREADY_OWNED'
  | 'NOT_OWNED'
  | 'NOT_EQUIPPABLE'
  | 'PIN_LIMIT'
  | 'PASS_NOT_FOUND'
  | 'PASS_ALREADY_USED'
  | 'BOX_NOT_FOUND'
  | 'CODE_INVALID';

const STATUS: Record<WalletErrorCode, number> = {
  REWARD_NOT_FOUND: 404,
  REWARD_UPCOMING: 409,
  REWARD_EXPIRED: 409,
  REWARD_LIMIT_REACHED: 409,
  REWARD_SOLD_OUT: 409,
  INSUFFICIENT_POINTS: 409,
  ALREADY_PROCESSED: 409,
  COSMETIC_NOT_FOUND: 404,
  PRICE_CHANGED: 409,
  ALREADY_OWNED: 409,
  NOT_OWNED: 404,
  NOT_EQUIPPABLE: 400,
  PIN_LIMIT: 409,
  PASS_NOT_FOUND: 404,
  PASS_ALREADY_USED: 409,
  BOX_NOT_FOUND: 404,
  CODE_INVALID: 400,
};

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(code: WalletErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isWalletError(e: unknown): e is WalletError {
  return e instanceof WalletError;
}
