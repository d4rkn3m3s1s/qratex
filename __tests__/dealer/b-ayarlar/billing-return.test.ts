/**
 * Ayarlar › Abonelik: Checkout dönüşü doğrulaması (B9). Yalnız bayinin kendi oturumu
 * uzlaştırılır; başkasının oturum kimliği `not_found` (abonelik bilgisi sızmaz, senkron yok).
 */
const mockSync = jest.fn();
const mockRetrieveSession = jest.fn();
const mockRetrieveSub = jest.fn();
let userRow: Record<string, unknown> = {};

jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn(async () => userRow) } },
}));
jest.mock('@/lib/stripe', () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    checkout: { sessions: { retrieve: (...a: unknown[]) => mockRetrieveSession(...a) } },
    subscriptions: { retrieve: (...a: unknown[]) => mockRetrieveSub(...a) },
  }),
}));
jest.mock('@/lib/billing-core', () => ({
  BLOCKING_SUBSCRIPTION_STATUSES: new Set(['active']),
  syncSubscriptionToUser: (...a: unknown[]) => mockSync(...a),
}));
jest.mock('@/lib/plan-limits', () => ({ getDealerPlanLimits: jest.fn() }));
jest.mock('@/lib/dealer/qr-codes/load.server', () => ({ loadQrQuota: jest.fn() }));

import { confirmCheckoutReturn } from '@/lib/dealer-settings/billing.server';

beforeEach(() => {
  jest.clearAllMocks();
  userRow = { stripeCustomerId: 'cus_A', pricingPlanId: 'plan_pro', subscriptionStatus: 'active' };
});

it('başka bayinin oturumu → not_found, senkron yapılmaz', async () => {
  mockRetrieveSession.mockResolvedValue({ id: 'cs_x', customer: 'cus_B', metadata: { dealerId: 'd2' }, status: 'complete', subscription: 'sub_1' });
  await expect(confirmCheckoutReturn('d1', 'cs_x')).resolves.toEqual({ state: 'not_found', planId: null });
  expect(mockSync).not.toHaveBeenCalled();
});

it('kendi tamamlanmış oturumu → abonelik taze okunup uzlaştırılır, active döner', async () => {
  mockRetrieveSession.mockResolvedValue({ id: 'cs_x', customer: 'cus_A', metadata: { dealerId: 'd1' }, status: 'complete', subscription: 'sub_1' });
  mockRetrieveSub.mockResolvedValue({ id: 'sub_1' });
  await expect(confirmCheckoutReturn('d1', 'cs_x')).resolves.toEqual({ state: 'active', planId: 'plan_pro' });
  expect(mockSync).toHaveBeenCalledWith({ id: 'sub_1' });
});

it('henüz tamamlanmamış oturum → processing (istemci yoklamaya devam eder)', async () => {
  mockRetrieveSession.mockResolvedValue({ id: 'cs_x', customer: 'cus_A', metadata: {}, status: 'open', subscription: null });
  await expect(confirmCheckoutReturn('d1', 'cs_x')).resolves.toEqual({ state: 'processing', planId: null });
});

it('Stripe oturumu bulamazsa not_found', async () => {
  mockRetrieveSession.mockRejectedValue(new Error('No such checkout.session'));
  await expect(confirmCheckoutReturn('d1', 'cs_yok')).resolves.toEqual({ state: 'not_found', planId: null });
});
