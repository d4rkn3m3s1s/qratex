/**
 * billing-core: abonelik → User senkron mantığı testleri.
 * Aktif abonelik planı atar; iptal/past_due ücretsiz kademeye düşürür.
 */
const mockUserUpdate = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { update: (...a: unknown[]) => mockUserUpdate(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  },
}));

jest.mock('@/lib/stripe', () => ({
  getStripe: () => null,
  getBillingReturnOrigin: () => 'https://app.example',
}));

import { syncSubscriptionToUser } from '@/lib/billing-core';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    current_period_end: 1_900_000_000,
    metadata: { dealerId: 'd1', planId: 'plan_pro' },
    ...overrides,
  } as never;
}

beforeEach(() => {
  mockUserUpdate.mockReset().mockResolvedValue({});
  mockAuditCreate.mockReset().mockResolvedValue({});
});

describe('syncSubscriptionToUser', () => {
  it('aktif abonelik planı atar', async () => {
    await syncSubscriptionToUser(makeSub({ status: 'active' }));
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
    const data = mockUserUpdate.mock.calls[0][0].data;
    expect(data.pricingPlanId).toBe('plan_pro');
    expect(data.subscriptionStatus).toBe('active');
    expect(data.subscriptionCurrentPeriodEnd).toBeInstanceOf(Date);
  });

  it('trialing de etkin sayılır (plan atanır)', async () => {
    await syncSubscriptionToUser(makeSub({ status: 'trialing' }));
    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBe('plan_pro');
  });

  it('iptal edilen abonelik planı kaldırır (ücretsiz kademe)', async () => {
    await syncSubscriptionToUser(makeSub({ status: 'canceled' }));
    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBeNull();
  });

  it('past_due planı kaldırır', async () => {
    await syncSubscriptionToUser(makeSub({ status: 'past_due' }));
    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBeNull();
  });

  it('dealerId metadata yoksa no-op (update çağrılmaz)', async () => {
    await syncSubscriptionToUser(makeSub({ metadata: {} }));
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('current_period_end yoksa null yazar', async () => {
    await syncSubscriptionToUser(makeSub({ current_period_end: null }));
    expect(mockUserUpdate.mock.calls[0][0].data.subscriptionCurrentPeriodEnd).toBeNull();
  });
});
