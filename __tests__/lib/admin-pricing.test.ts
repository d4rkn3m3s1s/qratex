/**
 * Admin → Fiyatlandırma sunucu mantığı ve saf sözleşme.
 *  - Saf: form ↔ girdi (0 ≠ sınırsız), aylık eşdeğer, özellik matrisi, Stripe karşılaştırması.
 *  - Sunucu: iyimser kilit 409, tek öne çıkan plan, arşiv (silme yok, aboneli plan onaysız 409),
 *    Stripe uyuşmazlığında kayıt reddi, sıralama doğrulaması, MRR/abone sayımı.
 * Prisma ve Stripe mock'lanır; gerçek DB'ye/Stripe'a gidilmez.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }));
jest.mock('@/lib/landing/public-pricing', () => ({ PUBLIC_PRICING_CACHE_TAG: 'public-pricing' }));
jest.mock('@/lib/billing-core', () => ({ PLAN_GRANTING_STATUSES: new Set(['active', 'trialing', 'past_due']) }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
const retrieve = jest.fn();
const createPrice = jest.fn();
let configured = true;
jest.mock('@/lib/stripe', () => ({
  isStripeConfigured: () => configured,
  getStripe: () => (configured ? { prices: { retrieve, create: createPrice } } : null),
}));

import { revalidateTag } from 'next/cache';
import { db, resetDb } from '../helpers/prisma-proxy';
import {
  EMPTY_PLAN_FORM,
  PlanFormSchema,
  buildFeatureMatrix,
  compareStripePrice,
  formToInput,
  monthlyEquivalent,
  toggleFeature,
} from '@/lib/admin-pricing/contract';
import { archivePlan, createPlan, getPricingOverview, reorderPlans, updatePlan } from '@/lib/admin-pricing/pricing.server';

const ctx = { actor: { id: 'admin-1', email: 'a@x.com', role: 'ADMIN', name: 'Ayşe', type: 'user' as const }, request: null };
const T0 = new Date('2026-10-01T10:00:00.000Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Pro',
    description: null,
    price: 299,
    currency: 'TRY',
    interval: 'monthly',
    features: ['Raporlar'],
    maxQRCodes: 50,
    maxBranches: 3,
    stripePriceId: null,
    isPopular: false,
    isActive: true,
    archivedAt: null,
    order: 0,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

const stripePrice = (over: Record<string, unknown> = {}) => ({
  id: 'price_abc123',
  active: true,
  currency: 'try',
  unit_amount: 29900,
  type: 'recurring',
  recurring: { interval: 'month', interval_count: 1 },
  livemode: false,
  product: { name: 'Pro' },
  ...over,
});

beforeEach(() => {
  resetDb();
  configured = true;
  retrieve.mockReset();
  createPrice.mockReset();
  (revalidateTag as jest.Mock).mockClear();
  db.auditLog.create.mockResolvedValue({});
});

describe('sözleşme (saf)', () => {
  it('0 limit sınırsız DEĞİL; sınırsız yalnız açık anahtarla', () => {
    const v = { ...EMPTY_PLAN_FORM, name: 'Vitrin', featuresText: 'Menü', maxQRCodes: 0, qrUnlimited: false, branchUnlimited: true };
    expect(PlanFormSchema.safeParse(v).success).toBe(true);
    const input = formToInput(v);
    expect(input.maxQRCodes).toBe(0);
    expect(input.maxBranches).toBeNull();
  });

  it('limit boş ve sınırsız kapalıysa form hatası', () => {
    const r = PlanFormSchema.safeParse({ ...EMPTY_PLAN_FORM, name: 'X1', featuresText: 'a', maxQRCodes: null });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toContain('maxQRCodes');
  });

  it('yinelenen özellik ve 2+ ondalık fiyat reddedilir', () => {
    expect(PlanFormSchema.safeParse({ ...EMPTY_PLAN_FORM, name: 'X1', featuresText: 'A\na' }).success).toBe(false);
    expect(PlanFormSchema.safeParse({ ...EMPTY_PLAN_FORM, name: 'X1', featuresText: 'A', price: 1.005 }).success).toBe(false);
    expect(PlanFormSchema.safeParse({ ...EMPTY_PLAN_FORM, name: 'X1', featuresText: 'A', price: 299.99 }).success).toBe(true);
  });

  it('aylık eşdeğer: yıllık ÷ 12, tek seferlik 0', () => {
    expect(monthlyEquivalent(1200, 'yearly')).toBe(100);
    expect(monthlyEquivalent(500, 'lifetime')).toBe(0);
    expect(monthlyEquivalent(299, 'monthly')).toBe(299);
  });

  it('özellik matrisi birleşir (Türkçe büyük/küçük harf duyarsız) ve hücre değişimi', () => {
    const m = buildFeatureMatrix([
      { id: 'a', features: ['İstatistik', 'Destek'] },
      { id: 'b', features: ['istatistik'] },
    ]);
    expect(m[0]).toEqual({ key: 'istatistik', label: 'İstatistik', planIds: ['a', 'b'] });
    expect(toggleFeature(['İstatistik', 'Destek'], 'istatistik', false)).toEqual(['Destek']);
    expect(toggleFeature(['Destek'], 'API', true)).toEqual(['Destek', 'API']);
  });

  it('Stripe karşılaştırması tutar/para birimi/döngü uyuşmazlığını yakalar', () => {
    const exp = { price: 299, currency: 'TRY', interval: 'monthly' as const };
    expect(compareStripePrice(exp, stripePrice() as never).status).toBe('match');
    const bad = compareStripePrice(exp, stripePrice({ unit_amount: 39900, recurring: { interval: 'year', interval_count: 1 } }) as never);
    expect(bad.status).toBe('mismatch');
    expect(bad.mismatches).toHaveLength(2);
    expect(compareStripePrice(exp, stripePrice({ active: false }) as never).status).toBe('inactive');
    expect(compareStripePrice({ ...exp, interval: 'lifetime' }, stripePrice({ type: 'one_time', recurring: null }) as never).status).toBe('match');
  });
});

describe('getPricingOverview', () => {
  it('abone/ödeyen/elle sayımı, MRR ve eşlenmemiş satıştaki plan', async () => {
    db.pricingPlan.findMany.mockResolvedValue([row(), row({ id: 'p2', name: 'Yıllık', interval: 'yearly', price: 1200, stripePriceId: 'price_x1y2z3' })]);
    db.user.groupBy.mockResolvedValue([
      { pricingPlanId: 'p1', subscriptionStatus: 'active', _count: { _all: 2 } },
      { pricingPlanId: 'p1', subscriptionStatus: 'past_due', _count: { _all: 1 } },
      { pricingPlanId: 'p1', subscriptionStatus: null, _count: { _all: 4 } },
      { pricingPlanId: 'p1', subscriptionStatus: 'canceled', _count: { _all: 1 } },
      { pricingPlanId: 'p2', subscriptionStatus: 'active', _count: { _all: 3 } },
    ]);
    db.user.count.mockResolvedValue(7);
    db.auditLog.findMany.mockResolvedValue([
      { entityId: 'p1', action: 'UPDATE_PRICING_PLAN', createdAt: T0, actorSnapshot: null, user: { name: 'Ayşe', email: 'a@x.com' } },
    ]);
    const o = await getPricingOverview();
    const p1 = o.plans[0];
    expect(p1.subscribers).toEqual({ total: 8, paying: 3, pastDue: 1, manual: 4 });
    expect(p1.mrr).toBe(897);
    expect(p1.lastChange?.by).toBe('Ayşe');
    expect(o.plans[1].mrr).toBe(300);
    expect(o.kpis.mrrByCurrency).toEqual([{ currency: 'TRY', amount: 1197 }]);
    expect(o.kpis.payingSubscribers).toBe(6);
    expect(o.kpis.freeTierDealers).toBe(7);
    expect(o.kpis.unmappedSellable).toBe(1);
  });
});

describe('createPlan', () => {
  const input = {
    name: 'Pro',
    description: null,
    price: 299,
    currency: 'TRY' as const,
    interval: 'monthly' as const,
    features: ['Raporlar'],
    maxQRCodes: 0,
    maxBranches: null,
    stripePriceId: null,
    isPopular: true,
    isActive: false,
  };

  it('tek öne çıkan kuralı + sıra sonuna + denetim + vitrin önbelleği', async () => {
    db.pricingPlan.aggregate.mockResolvedValue({ _max: { order: 4 } });
    db.pricingPlan.updateMany.mockResolvedValue({ count: 1 });
    db.pricingPlan.create.mockResolvedValue(row({ maxQRCodes: 0, maxBranches: null, isPopular: true, order: 5 }));
    const r = await createPlan(ctx, input);
    expect(db.pricingPlan.updateMany).toHaveBeenCalledWith({ where: { isPopular: true }, data: { isPopular: false } });
    expect(db.pricingPlan.create.mock.calls[0][0].data).toMatchObject({ order: 5, maxQRCodes: 0 });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('CREATE_PRICING_PLAN');
    expect(r.plan.maxQRCodes).toBe(0);
    expect(revalidateTag).toHaveBeenCalledWith('public-pricing', 'max');
  });

  it('Stripe fiyatı plana uymuyorsa kayıt reddedilir (alan hatası)', async () => {
    retrieve.mockResolvedValue(stripePrice({ unit_amount: 19900 }));
    await expect(createPlan(ctx, { ...input, stripePriceId: 'price_abc123' })).rejects.toMatchObject({
      code: 'VALIDATION',
      details: [expect.objectContaining({ path: 'stripePriceId' })],
    });
    expect(db.pricingPlan.create).not.toHaveBeenCalled();
  });

  it('tek seferlik plana Stripe fiyatı verilemez', async () => {
    await expect(createPlan(ctx, { ...input, interval: 'lifetime', stripePriceId: 'price_abc123' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('updatePlan', () => {
  it('sürüm eskiyse 409 CONFLICT, yazılmaz', async () => {
    db.pricingPlan.findUnique.mockResolvedValue(row({ updatedAt: new Date('2026-10-02T00:00:00.000Z') }));
    await expect(updatePlan(ctx, 'p1', { name: 'Yeni', expectedUpdatedAt: T0.toISOString() })).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(db.pricingPlan.updateMany).not.toHaveBeenCalled();
  });

  it('arşivli plan düzenlenemez', async () => {
    db.pricingPlan.findUnique.mockResolvedValue(row({ archivedAt: T0 }));
    await expect(updatePlan(ctx, 'p1', { name: 'Yeni', expectedUpdatedAt: T0.toISOString() })).rejects.toMatchObject({ status: 409 });
  });

  it('kilitli yazım + yalnız değişen alanlar denetime + öne çıkan tekilleşir', async () => {
    const after = row({ name: 'Pro+', isPopular: true, updatedAt: new Date('2026-10-03T00:00:00.000Z') });
    db.pricingPlan.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row()).mockResolvedValueOnce(after);
    db.pricingPlan.updateMany.mockResolvedValue({ count: 1 });
    const r = await updatePlan(ctx, 'p1', { name: 'Pro+', isPopular: true, expectedUpdatedAt: T0.toISOString() });
    expect(db.pricingPlan.updateMany).toHaveBeenCalledWith({ where: { isPopular: true, id: { not: 'p1' } }, data: { isPopular: false } });
    expect(db.pricingPlan.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', updatedAt: T0 }, data: { name: 'Pro+', isPopular: true } });
    expect(r.changed.sort()).toEqual(['isPopular', 'name']);
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit.oldData).toEqual({ name: 'Pro', isPopular: false });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('eşlenmiş planın fiyatı değişip Stripe uymazsa reddedilir', async () => {
    db.pricingPlan.findUnique.mockResolvedValue(row({ stripePriceId: 'price_abc123' }));
    retrieve.mockResolvedValue(stripePrice());
    await expect(updatePlan(ctx, 'p1', { price: 399, expectedUpdatedAt: T0.toISOString() })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('Stripe’ta olmayan fiyat kimliği reddedilir', async () => {
    db.pricingPlan.findUnique.mockResolvedValue(row());
    retrieve.mockRejectedValue(Object.assign(new Error('No such price'), { statusCode: 404 }));
    await expect(updatePlan(ctx, 'p1', { stripePriceId: 'price_nope12', expectedUpdatedAt: T0.toISOString() })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('archivePlan (silme yok)', () => {
  it('aboneli plan onaysız 409 CONFIRM_REQUIRED, hiçbir şey yazılmaz', async () => {
    db.pricingPlan.findUnique.mockResolvedValue(row());
    db.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    await expect(archivePlan(ctx, 'p1', {})).rejects.toMatchObject({ code: 'CONFIRM_REQUIRED', status: 409 });
    expect(db.pricingPlan.update).not.toHaveBeenCalled();
    expect(db.pricingPlan.delete).not.toHaveBeenCalled();
  });

  it('dryRun yalnız etki döner', async () => {
    db.pricingPlan.findUnique.mockResolvedValue(row());
    db.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const r = await archivePlan(ctx, 'p1', { dryRun: true });
    expect(r).toEqual({ archived: false, impact: { planId: 'p1', planName: 'Pro', subscribers: 5, paying: 2 } });
    expect(db.pricingPlan.update).not.toHaveBeenCalled();
  });

  it('onayla arşivler (archivedAt + satış kapalı), aboneler dokunulmaz', async () => {
    db.pricingPlan.findUnique.mockResolvedValue(row({ isPopular: true }));
    db.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const r = await archivePlan(ctx, 'p1', { confirm: true });
    expect(r.archived).toBe(true);
    expect(db.pricingPlan.update.mock.calls[0][0].data).toMatchObject({ isActive: false, isPopular: false });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.pricingPlan.delete).not.toHaveBeenCalled();
  });
});

describe('reorderPlans', () => {
  it('eksik kimlik → 409', async () => {
    db.pricingPlan.findMany.mockResolvedValue([{ id: 'a', order: 0 }, { id: 'b', order: 1 }]);
    await expect(reorderPlans(ctx, ['a'])).rejects.toMatchObject({ status: 409 });
  });
  it('yalnız yeri değişenler yazılır', async () => {
    db.pricingPlan.findMany.mockResolvedValue([{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }]);
    db.pricingPlan.update.mockResolvedValue({});
    await reorderPlans(ctx, ['b', 'a', 'c']);
    expect(db.pricingPlan.update).toHaveBeenCalledTimes(2);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('REORDER_PRICING_PLANS');
  });
});
