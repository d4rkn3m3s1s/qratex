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

  it('pasif/arşivlenmiş plan mevcut aboneyi ücretsiz kademeye DÜŞÜRMEZ (P0-26)', async () => {
    // Pasifleştirme/arşiv yalnız yeni satışı kapatır; plan limitleri aboneler için geçerli kalır.
    mockUserFindUnique.mockResolvedValue({
      role: 'DEALER',
      pricingPlan: { name: 'Eski', maxQRCodes: 100, maxBranches: 5, isActive: false, archivedAt: new Date() },
    });
    const limits = await getDealerPlanLimits('d-1');
    expect(limits.maxQRCodes).toBe(100);
    expect(limits.maxBranches).toBe(5);
    expect(limits.planName).toBe('Eski');
  });

  it('kota CANLI kodları sayar (iptal/arşiv hariç; geri alma ayrıca kotadan geçer, P0-24/F12)', async () => {
    mockUserFindUnique.mockResolvedValue({
      role: 'DEALER',
      pricingPlan: { name: 'Başlangıç', maxQRCodes: 3, maxBranches: 1 },
    });
    mockQrCount.mockResolvedValue(3);
    const res = await canCreateQRCode('d-1');
    expect(res.allowed).toBe(false);
    // lib/qr-quota.ts#liveQrWhere ile aynı tanım.
    expect(mockQrCount).toHaveBeenCalledWith({ where: { dealerId: 'd-1', revokedAt: null, archivedAt: null } });
  });
});
