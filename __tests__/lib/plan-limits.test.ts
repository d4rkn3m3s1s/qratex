/**
 * Plan kotası uygulama testleri: sınırsız plan, limit-altı, limit-aşımı,
 * ADMIN bypass ve plansız (ücretsiz kademe) varsayılanı.
 */
const mockUserFindUnique = jest.fn();
const mockQrCount = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    qRCode: { count: (...args: unknown[]) => mockQrCount(...args) },
  },
}));

import { canCreateQRCode, getDealerPlanLimits } from '@/lib/plan-limits';

beforeEach(() => {
  mockUserFindUnique.mockReset();
  mockQrCount.mockReset();
  delete process.env.FREE_TIER_MAX_QRCODES;
});

describe('plan-limits', () => {
  it('ADMIN sınırsızdır (kota kontrolü yok)', async () => {
    mockUserFindUnique.mockResolvedValue({ role: 'ADMIN', pricingPlan: null });
    const res = await canCreateQRCode('admin-1');
    expect(res.allowed).toBe(true);
    expect(res.limit).toBeNull();
    expect(mockQrCount).not.toHaveBeenCalled();
  });

  it('plansız bayi ücretsiz kademeye tabidir (varsayılan 3)', async () => {
    mockUserFindUnique.mockResolvedValue({ role: 'DEALER', pricingPlan: null });
    const limits = await getDealerPlanLimits('d-1');
    expect(limits.maxQRCodes).toBe(3);
  });

  it('limitin altındaki bayi QR oluşturabilir', async () => {
    mockUserFindUnique.mockResolvedValue({
      role: 'DEALER',
      pricingPlan: { name: 'Başlangıç', maxQRCodes: 5, maxBranches: 1, isActive: true },
    });
    mockQrCount.mockResolvedValue(2);
    const res = await canCreateQRCode('d-1');
    expect(res.allowed).toBe(true);
    expect(res.used).toBe(2);
    expect(res.limit).toBe(5);
  });

  it('limite ulaşan bayi engellenir + upsell mesajı döner', async () => {
    mockUserFindUnique.mockResolvedValue({
      role: 'DEALER',
      pricingPlan: { name: 'Başlangıç', maxQRCodes: 5, maxBranches: 1, isActive: true },
    });
    mockQrCount.mockResolvedValue(5);
    const res = await canCreateQRCode('d-1');
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/limit/i);
  });

  it('sınırsız plan (maxQRCodes null) her zaman izinlidir', async () => {
    mockUserFindUnique.mockResolvedValue({
      role: 'DEALER',
      pricingPlan: { name: 'Pro', maxQRCodes: null, maxBranches: null, isActive: true },
    });
    const res = await canCreateQRCode('d-1');
    expect(res.allowed).toBe(true);
    expect(res.limit).toBeNull();
    expect(mockQrCount).not.toHaveBeenCalled();
  });

  it('pasif plan ücretsiz kademeye düşürür', async () => {
    mockUserFindUnique.mockResolvedValue({
      role: 'DEALER',
      pricingPlan: { name: 'Eski', maxQRCodes: 100, maxBranches: 5, isActive: false },
    });
    const limits = await getDealerPlanLimits('d-1');
    expect(limits.maxQRCodes).toBe(3);
    expect(limits.planName).toBe('Ücretsiz');
  });
});
