/** Kasa hatalarını `defineRoute` zarfına çevirir (route'lar paylaşır). */
import { ApiError } from '@/lib/http/define-route';
import { isEconomyError } from '@/lib/economy';
import { isConsumptionError } from '@/lib/consumption/service';
import { KasaError } from './server';

export function toApiError(e: unknown): unknown {
  if (e instanceof KasaError) return new ApiError(e.code, e.message, { status: e.status });
  if (isConsumptionError(e)) {
    return new ApiError(e.code, e.message, {
      status: e.httpStatus,
      retryable: e.retryable,
      ...(e.retryAfterSec ? { headers: { 'Retry-After': String(e.retryAfterSec) } } : {}),
    });
  }
  if (isEconomyError(e)) return new ApiError(e.code, e.message, { status: e.httpStatus });
  return e;
}

export async function mapKasaErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toApiError(e);
  }
}
