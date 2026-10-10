/**
 * Route katmanı köprüsü: cüzdan/ekonomi hatalarını `defineRoute` zarfına çevirir.
 */
import { ApiError } from '@/lib/http/define-route';
import { isEconomyError } from '@/lib/economy/errors';
import { isWalletError } from './errors';

export function rethrowAsApiError(err: unknown): never {
  if (isWalletError(err)) {
    throw new ApiError(err.code, err.message, { status: err.status, details: err.details });
  }
  if (isEconomyError(err)) {
    throw new ApiError(err.code, err.message, { status: err.httpStatus, details: err.details });
  }
  throw err;
}
