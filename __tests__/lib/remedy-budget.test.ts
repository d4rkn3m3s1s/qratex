import {
  effectiveRemedyBudget,
  parseRemedyBudgetConfig,
  remedyBudgetCeiling,
  validateDealerCap,
} from '@/lib/remedy-budget';
import { REMEDY_DEALER_DAILY_CAP } from '@/lib/economy/caps';
import { isRemedyExpired, remedyExpiresAt } from '@/lib/remedy-offer-service';

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

describe('telafi bütçesi kuralları', () => {
  it('varsayılan 5.000; bozuk Json varsayılana düşer', () => {
    expect(REMEDY_DEALER_DAILY_CAP).toBe(5000);
    const cfg = parseRemedyBudgetConfig('çöp');
    expect(cfg).toEqual({ adminCap: null, dealerCap: null });
    expect(effectiveRemedyBudget(cfg)).toBe(5000);
  });

  it('etkin = min(admin tavanı ?? varsayılan, bayi limiti)', () => {
    expect(effectiveRemedyBudget({ adminCap: 8000, dealerCap: null })).toBe(8000);
    expect(effectiveRemedyBudget({ adminCap: 8000, dealerCap: 2000 })).toBe(2000);
    expect(effectiveRemedyBudget({ adminCap: 1000, dealerCap: 2000 })).toBe(1000);
    expect(effectiveRemedyBudget({ adminCap: null, dealerCap: 0 })).toBe(0);
  });

  it('bayi tavanın üstüne çıkamaz; negatif/kesirli reddedilir; null serbest', () => {
    expect(validateDealerCap({ adminCap: null, dealerCap: null }, 5001)).toMatch(/en fazla/);
    expect(validateDealerCap({ adminCap: null, dealerCap: null }, 4000)).toBeNull();
    expect(validateDealerCap({ adminCap: 3000, dealerCap: null }, 3500)).toMatch(/en fazla/);
    expect(validateDealerCap({ adminCap: null, dealerCap: null }, -1)).toMatch(/pozitif/);
    expect(validateDealerCap({ adminCap: null, dealerCap: null }, null)).toBeNull();
    expect(remedyBudgetCeiling({ adminCap: 3000, dealerCap: 10 })).toBe(3000);
  });

  it('teklif süresi: 30 gün; sınır anı dahil süresi geçmiş sayılır; null süresiz', () => {
    const t = new Date('2026-10-01T00:00:00Z');
    const exp = remedyExpiresAt(t);
    expect(exp.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(isRemedyExpired(exp, new Date(exp.getTime() - 1))).toBe(false);
    expect(isRemedyExpired(exp, exp)).toBe(true);
    expect(isRemedyExpired(null, new Date('2099-01-01'))).toBe(false);
  });
});
