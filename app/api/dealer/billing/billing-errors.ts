import { ApiError } from '@/lib/http/define-route';
import type { BillingErrorCode } from '@/lib/billing-core';

/** Faturalama hata kodu → HTTP hatası. Mesajlar lib/billing-core'da Türkçe üretilir. */
export function billingErrorToApiError(code: BillingErrorCode | undefined, message: string | undefined): ApiError {
  switch (code) {
    case 'STRIPE_DISABLED':
      return new ApiError('SERVICE_UNAVAILABLE', message ?? 'Ödeme sistemi şu an kullanılamıyor', { status: 503 });
    case 'PLAN_NOT_FOUND':
      return new ApiError('NOT_FOUND', message);
    case 'NO_SUBSCRIPTION':
    case 'SUBSCRIPTION_NOT_CHANGEABLE':
    case 'ALREADY_ON_PLAN':
    case 'SUBSCRIPTION_EXISTS':
      return new ApiError(code, message, { status: 409 });
    case 'PAYMENT_PENDING':
      return new ApiError(code, message, { status: 402 });
    default:
      return new ApiError(code ?? 'BAD_REQUEST', message, { status: 400 });
  }
}
