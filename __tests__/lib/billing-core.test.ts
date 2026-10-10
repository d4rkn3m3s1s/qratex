/**
 * billing-core (P0-29): çift Stripe aboneliği, plan değişikliği ve webhook uzlaştırması.
 *
 * Yeniden üretilen hata senaryoları:
 *  - Mevcut abone "Bu plana geç" → ikinci Checkout/abonelik (çift ücret).
 *  - Eski aboneliğin `deleted`/`updated` olayı ödenen yeni planı siler/geri yazar.
 *  - Yeniden denenen eski `updated` olayı iptal edilmiş aboneliğe planı geri verir.
 *  - Plan metadata'dan çözülüyor (fiyattan değil).
 *  - Aynı Stripe olayı iki kez gelince iki kez işleniyor.
 */
const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserUpdateMany = jest.fn();
const mockAuditCreate = jest.fn();
const mockPlanFindUnique = jest.fn();
const mockPlanFindFirst = jest.fn();
const mockEventCreate = jest.fn();
const mockEventFindUnique = jest.fn();
const mockEventUpdateMany = jest.fn();
const mockEventFindFirst = jest.fn();
const mockEventUpdate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      update: (...a: unknown[]) => mockUserUpdate(...a),
      updateMany: (...a: unknown[]) => mockUserUpdateMany(...a),
    },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
    pricingPlan: {
      findUnique: (...a: unknown[]) => mockPlanFindUnique(...a),
      findFirst: (...a: unknown[]) => mockPlanFindFirst(...a),
    },
    stripeEvent: {
      create: (...a: unknown[]) => mockEventCreate(...a),
      findUnique: (...a: unknown[]) => mockEventFindUnique(...a),
      updateMany: (...a: unknown[]) => mockEventUpdateMany(...a),
      findFirst: (...a: unknown[]) => mockEventFindFirst(...a),
      update: (...a: unknown[]) => mockEventUpdate(...a),
    },
  },
}));

const stripe = {
  customers: { create: jest.fn() },
  subscriptions: { list: jest.fn(), retrieve: jest.fn(), update: jest.fn() },
  checkout: { sessions: { list: jest.fn(), create: jest.fn(), expire: jest.fn() } },
  invoices: { createPreview: jest.fn() },
  billingPortal: { sessions: { create: jest.fn() } },
};
let stripeEnabled = true;

jest.mock('@/lib/stripe', () => ({
  getStripe: () => (stripeEnabled ? stripe : null),
  getBillingReturnOrigin: () => 'https://app.example',
}));

import {
  changeSubscriptionPlan,
  claimStripeEvent,
  createCheckoutSession,
  finishStripeEvent,
  isStaleStripeEvent,
  previewPlanChange,
  syncSubscriptionToUser,
} from '@/lib/billing-core';

const PRICE_PRO = 'price_pro';
const PRICE_BIZ = 'price_biz';

function makeSub(overrides: Record<string, unknown> = {}) {
  const price = (overrides.price as string) ?? PRICE_PRO;
  const rest = { ...overrides };
  delete rest.price;
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    created: 1_700_000_000,
    current_period_end: 1_900_000_000,
    metadata: { dealerId: 'd1', planId: 'plan_meta_STALE' },
    items: { data: [{ id: 'si_1', price: { id: price } }] },
    pending_update: null,
    ...rest,
  } as never;
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    subscriptionStatus: 'active',
    pricingPlanId: 'plan_pro',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  stripeEnabled = true;
  mockUserUpdate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
  mockPlanFindFirst.mockImplementation(async ({ where }: { where: { stripePriceId: string } }) => {
    if (where.stripePriceId === PRICE_PRO) return { id: 'plan_pro' };
    if (where.stripePriceId === PRICE_BIZ) return { id: 'plan_biz' };
    return null;
  });
  stripe.checkout.sessions.list.mockResolvedValue({ data: [] });
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
});

describe('syncSubscriptionToUser — uzlaştırma', () => {
  it('planı abonelik metadata\'sından değil FİYATTAN çözer', async () => {
    mockUserFindUnique.mockResolvedValue(dbUser({ pricingPlanId: null }));
    stripe.subscriptions.list.mockResolvedValue({ data: [makeSub({ price: PRICE_BIZ })] });

    const out = await syncSubscriptionToUser(makeSub({ price: PRICE_BIZ }));

    expect(out.status).toBe('applied');
    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBe('plan_biz');
  });

  it('P0-29: eski aboneliğin deleted olayı ödenen YENİ planı silmez', async () => {
    // Bayi S1 (Pro) → S2 (Business) geçmiş; DB S2'yi tutuyor. S1'in iptal olayı geliyor.
    mockUserFindUnique.mockResolvedValue(
      dbUser({ stripeSubscriptionId: 'sub_2', subscriptionStatus: 'active', pricingPlanId: 'plan_biz' })
    );
    const s1 = makeSub({ id: 'sub_1', status: 'canceled', price: PRICE_PRO, created: 1 });
    const s2 = makeSub({ id: 'sub_2', status: 'active', price: PRICE_BIZ, created: 2 });
    stripe.subscriptions.list.mockResolvedValue({ data: [s2, s1] });

    const out = await syncSubscriptionToUser(s1);

    expect(out.subscriptionId).toBe('sub_2');
    const data = mockUserUpdate.mock.calls[0][0].data;
    expect(data.stripeSubscriptionId).toBe('sub_2');
    expect(data.subscriptionStatus).toBe('active');
    expect(data.pricingPlanId).toBe('plan_biz');
  });

  it('Stripe listesi yokken de yabancı aboneliğin olayı mevcut planı ezmez', async () => {
    stripeEnabled = false;
    mockUserFindUnique.mockResolvedValue(
      dbUser({ stripeSubscriptionId: 'sub_2', subscriptionStatus: 'active', pricingPlanId: 'plan_biz' })
    );

    const out = await syncSubscriptionToUser(makeSub({ id: 'sub_1', status: 'canceled' }));

    expect(out).toMatchObject({ status: 'ignored', reason: 'foreign_subscription' });
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate.mock.calls[0][0].data.action).toBe('subscription_event_ignored');
  });

  it('yeniden denenen eski "active" olayı iptal edilmiş aboneliğe planı geri VERMEZ (taze durum yazılır)', async () => {
    mockUserFindUnique.mockResolvedValue(
      dbUser({ subscriptionStatus: 'canceled', pricingPlanId: null })
    );
    // Olay yükü eski (active) ama Stripe'taki gerçek durum canceled.
    stripe.subscriptions.list.mockResolvedValue({ data: [makeSub({ status: 'canceled' })] });

    await syncSubscriptionToUser(makeSub({ status: 'active' }));

    const data = mockUserUpdate.mock.calls[0][0].data;
    expect(data.subscriptionStatus).toBe('canceled');
    expect(data.pricingPlanId).toBeNull();
  });

  it('iptalden sonra yeni abonelik benimsenir', async () => {
    mockUserFindUnique.mockResolvedValue(dbUser({ subscriptionStatus: 'canceled', pricingPlanId: null }));
    const s1 = makeSub({ id: 'sub_1', status: 'canceled', created: 1 });
    const s2 = makeSub({ id: 'sub_2', status: 'active', price: PRICE_BIZ, created: 2 });
    stripe.subscriptions.list.mockResolvedValue({ data: [s2, s1] });

    await syncSubscriptionToUser(s2);

    const data = mockUserUpdate.mock.calls[0][0].data;
    expect(data.stripeSubscriptionId).toBe('sub_2');
    expect(data.pricingPlanId).toBe('plan_biz');
  });

  it('iki plan veren abonelik (çift ücret) denetime düşer, kayıtlı abonelik korunur', async () => {
    mockUserFindUnique.mockResolvedValue(dbUser());
    const s1 = makeSub({ id: 'sub_1', status: 'active', created: 1 });
    const s2 = makeSub({ id: 'sub_2', status: 'active', price: PRICE_BIZ, created: 2 });
    stripe.subscriptions.list.mockResolvedValue({ data: [s2, s1] });

    const out = await syncSubscriptionToUser(s2);

    expect(out.duplicate).toBe(true);
    expect(mockUserUpdate.mock.calls[0][0].data.stripeSubscriptionId).toBe('sub_1');
    const actions = mockAuditCreate.mock.calls.map((c) => c[0].data.action);
    expect(actions).toContain('subscription_duplicate_detected');
  });

  it('past_due (Stripe yeniden deneme penceresi) planı korur; unpaid düşürür', async () => {
    mockUserFindUnique.mockResolvedValue(dbUser());
    stripe.subscriptions.list.mockResolvedValue({ data: [makeSub({ status: 'past_due' })] });
    await syncSubscriptionToUser(makeSub({ status: 'past_due' }));
    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBe('plan_pro');

    mockUserUpdate.mockClear();
    stripe.subscriptions.list.mockResolvedValue({ data: [makeSub({ status: 'unpaid' })] });
    await syncSubscriptionToUser(makeSub({ status: 'unpaid' }));
    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBeNull();
  });

  it('eşlenmeyen fiyat ödeyen bayiyi düşürmez; denetime düşer', async () => {
    mockUserFindUnique.mockResolvedValue(dbUser({ pricingPlanId: 'plan_pro' }));
    const sub = makeSub({ price: 'price_unknown' });
    stripe.subscriptions.list.mockResolvedValue({ data: [sub] });

    await syncSubscriptionToUser(sub);

    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBe('plan_pro');
    expect(mockAuditCreate.mock.calls[0][0].data.action).toBe('subscription_price_unmapped');
  });

  it('bayi bulunamazsa hata fırlatmaz (Stripe 3 gün yeniden denemesin)', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const out = await syncSubscriptionToUser(makeSub());
    expect(out).toMatchObject({ status: 'ignored', reason: 'user_not_found' });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('metadata yoksa bayiyi Stripe müşteri kimliğiyle bulur', async () => {
    mockUserFindUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) =>
      where.stripeCustomerId === 'cus_1' ? dbUser() : null
    );
    stripe.subscriptions.list.mockResolvedValue({ data: [makeSub({ metadata: {} })] });
    const out = await syncSubscriptionToUser(makeSub({ metadata: {} }));
    expect(out.status).toBe('applied');
  });
});

describe('createCheckoutSession — çift abonelik engeli', () => {
  beforeEach(() => {
    mockPlanFindUnique.mockResolvedValue({
      id: 'plan_biz',
      name: 'Business',
      stripePriceId: PRICE_BIZ,
      isActive: true,
      archivedAt: null,
      interval: 'monthly',
    });
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe/new' });
  });

  it('P0-29: aktif abonesi olan bayiye yeni Checkout AÇILMAZ', async () => {
    mockUserFindUnique.mockResolvedValue(dbUser());

    const r = await createCheckoutSession('d1', 'plan_biz');

    expect(r).toMatchObject({ ok: false, code: 'SUBSCRIPTION_EXISTS' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('DB eski olsa bile Stripe\'ta canlı abonelik varsa Checkout açılmaz (webhook gecikmesi)', async () => {
    mockUserFindUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
      select.email
        ? { id: 'd1', email: 'a@b.c', name: 'A', businessName: 'B', stripeCustomerId: 'cus_1' }
        : { stripeSubscriptionId: null, subscriptionStatus: null }
    );
    stripe.subscriptions.list.mockResolvedValue({ data: [makeSub({ status: 'trialing' })] });

    const r = await createCheckoutSession('d1', 'plan_biz');

    expect(r.code).toBe('SUBSCRIPTION_EXISTS');
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('aboneliği olmayan bayi için oturum açar; aynı planın açık oturumu yeniden kullanılır, diğerleri kapatılır', async () => {
    mockUserFindUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
      select.email
        ? { id: 'd1', email: 'a@b.c', name: 'A', businessName: 'B', stripeCustomerId: 'cus_1' }
        : { stripeSubscriptionId: null, subscriptionStatus: null }
    );
    stripe.checkout.sessions.list.mockResolvedValue({
      data: [
        { id: 'cs_same', mode: 'subscription', metadata: { planId: 'plan_biz' }, url: 'https://checkout.stripe/same' },
        { id: 'cs_other', mode: 'subscription', metadata: { planId: 'plan_pro' }, url: 'https://checkout.stripe/other' },
      ],
    });

    const r = await createCheckoutSession('d1', 'plan_biz');

    expect(r).toEqual({ ok: true, url: 'https://checkout.stripe/same' });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_other');
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('ilk abonelikte yeni oturum açar; dönüş adresi session_id taşır', async () => {
    mockUserFindUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
      select.email
        ? { id: 'd1', email: 'a@b.c', name: 'A', businessName: 'B', stripeCustomerId: 'cus_1' }
        : { stripeSubscriptionId: null, subscriptionStatus: null }
    );
    const r = await createCheckoutSession('d1', 'plan_biz');
    expect(r).toEqual({ ok: true, url: 'https://checkout.stripe/new' });
    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.mode).toBe('subscription');
    expect(args.success_url).toContain('session_id={CHECKOUT_SESSION_ID}');
  });

  it('tek seferlik (lifetime) planı abonelik moduna göndermez', async () => {
    mockPlanFindUnique.mockResolvedValue({
      id: 'plan_life',
      name: 'Ömür boyu',
      stripePriceId: 'price_life',
      isActive: true,
      archivedAt: null,
      interval: 'lifetime',
    });
    const r = await createCheckoutSession('d1', 'plan_life');
    expect(r.code).toBe('PLAN_ONE_TIME');
  });

  it('Customer oluşturma yarışında yetim kayıt üretmez (idempotency + koşullu yazım)', async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({ stripeSubscriptionId: null, subscriptionStatus: null })
      .mockResolvedValueOnce({ id: 'd1', email: 'a@b.c', name: 'A', businessName: 'B', stripeCustomerId: null })
      .mockResolvedValueOnce({ stripeCustomerId: 'cus_winner' });
    stripe.customers.create.mockResolvedValue({ id: 'cus_loser' });
    mockUserUpdateMany.mockResolvedValue({ count: 0 });

    await createCheckoutSession('d1', 'plan_biz');

    expect(stripe.customers.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'qratex-customer-d1' });
    expect(mockUserUpdateMany.mock.calls[0][0].where).toEqual({ id: 'd1', stripeCustomerId: null });
    expect(stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe('cus_winner');
  });
});

describe('changeSubscriptionPlan — subscriptions.update', () => {
  beforeEach(() => {
    mockPlanFindUnique.mockResolvedValue({
      id: 'plan_biz',
      name: 'Business',
      stripePriceId: PRICE_BIZ,
      isActive: true,
      archivedAt: null,
      interval: 'monthly',
    });
    mockUserFindUnique.mockResolvedValue(dbUser());
    stripe.subscriptions.retrieve.mockResolvedValue(makeSub());
  });

  it('mevcut aboneliği günceller; yeni abonelik/Checkout AÇMAZ', async () => {
    const updated = makeSub({ price: PRICE_BIZ });
    stripe.subscriptions.update.mockResolvedValue(updated);
    stripe.subscriptions.list.mockResolvedValue({ data: [updated] });
    const prorationDate = Math.floor(Date.now() / 1000) - 30;

    const r = await changeSubscriptionPlan('d1', 'plan_biz', { prorationDate });

    expect(r).toMatchObject({ ok: true, planId: 'plan_biz' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    const [subId, params, opts] = stripe.subscriptions.update.mock.calls[0];
    expect(subId).toBe('sub_1');
    expect(params).toMatchObject({
      items: [{ id: 'si_1', price: PRICE_BIZ }],
      proration_behavior: 'always_invoice',
      proration_date: prorationDate,
      payment_behavior: 'pending_if_incomplete',
    });
    expect(opts.idempotencyKey).toBe(`qratex-plan-change:sub_1:si_1:${PRICE_BIZ}:${prorationDate}`);
    expect(mockUserUpdate.mock.calls[0][0].data.pricingPlanId).toBe('plan_biz');
  });

  it('ödeme alınamazsa (pending_update) plan değişmez', async () => {
    stripe.subscriptions.update.mockResolvedValue(makeSub({ pending_update: { expires_at: 1 } }));
    const r = await changeSubscriptionPlan('d1', 'plan_biz');
    expect(r.ok === false && r.code).toBe('PAYMENT_PENDING');
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('zaten bu plandaysa güncellemez', async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(makeSub({ price: PRICE_BIZ }));
    const r = await changeSubscriptionPlan('d1', 'plan_biz');
    expect(r.ok === false && r.code).toBe('ALREADY_ON_PLAN');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('ödemesi bekleyen abonelikte plan değiştirilemez', async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(makeSub({ status: 'past_due' }));
    const r = await changeSubscriptionPlan('d1', 'plan_biz');
    expect(r.ok === false && r.code).toBe('SUBSCRIPTION_NOT_CHANGEABLE');
  });

  it('kayıtlı abonelik başka müşteriye aitse dokunmaz', async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(makeSub({ customer: 'cus_other' }));
    const r = await changeSubscriptionPlan('d1', 'plan_biz');
    expect(r.ok).toBe(false);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('aboneliği olmayan bayi için NO_SUBSCRIPTION', async () => {
    mockUserFindUnique.mockResolvedValue({ stripeSubscriptionId: null, stripeCustomerId: null });
    const r = await changeSubscriptionPlan('d1', 'plan_biz');
    expect(r.ok === false && r.code).toBe('NO_SUBSCRIPTION');
  });

  it('çok eski proration_date yok sayılır (şimdiki zaman kullanılır)', async () => {
    stripe.subscriptions.update.mockResolvedValue(makeSub({ price: PRICE_BIZ }));
    await changeSubscriptionPlan('d1', 'plan_biz', { prorationDate: 1 });
    const params = stripe.subscriptions.update.mock.calls[0][1];
    expect(params.proration_date).toBeGreaterThan(Math.floor(Date.now() / 1000) - 5);
  });
});

describe('previewPlanChange', () => {
  it('yalnız bu değişikliğe ait prorasyon satırlarını toplar', async () => {
    mockPlanFindUnique.mockResolvedValue({
      id: 'plan_biz',
      name: 'Business',
      stripePriceId: PRICE_BIZ,
      isActive: true,
      archivedAt: null,
      interval: 'monthly',
    });
    mockUserFindUnique.mockResolvedValue(dbUser());
    stripe.subscriptions.retrieve.mockResolvedValue(makeSub());
    stripe.invoices.createPreview.mockImplementation(async (params: { subscription_details: { proration_date: number } }) => {
      const pd = params.subscription_details.proration_date;
      return {
        currency: 'try',
        lines: {
          data: [
            { proration: true, period: { start: pd }, amount: -24900 },
            { proration: true, period: { start: pd }, amount: 49900 },
            { proration: true, period: { start: pd - 999 }, amount: 111 }, // başka değişiklik
            { proration: false, period: { start: pd + 10 }, amount: 99900 },
          ],
        },
      };
    });

    const r = await previewPlanChange('d1', 'plan_biz');

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preview.prorationAmount).toBe(25000);
      expect(r.preview.nextPeriodAmount).toBe(99900);
      expect(r.preview.currency).toBe('try');
    }
  });
});

describe('StripeEvent idempotency + sıra', () => {
  const ref = { id: 'evt_1', type: 'customer.subscription.updated', created: 1_800_000_000, objectId: 'sub_1' };

  it('ilk teslim sahiplenilir', async () => {
    mockEventCreate.mockResolvedValue({});
    await expect(claimStripeEvent(ref)).resolves.toBe('claimed');
    expect(mockEventCreate.mock.calls[0][0].data).toMatchObject({
      id: 'evt_1',
      objectId: 'sub_1',
      status: 'received',
      stripeCreatedAt: new Date(1_800_000_000 * 1000),
    });
  });

  it('işlenmiş olay tekrar gelirse yeniden işlenmez', async () => {
    mockEventCreate.mockRejectedValue({ code: 'P2002' });
    mockEventFindUnique.mockResolvedValue({ status: 'processed' });
    await expect(claimStripeEvent(ref)).resolves.toBe('duplicate');
    expect(mockEventUpdateMany).not.toHaveBeenCalled();
  });

  it('başarısız olay yeniden denemede tek örnek tarafından devralınır', async () => {
    mockEventCreate.mockRejectedValue({ code: 'P2002' });
    mockEventFindUnique.mockResolvedValue({ status: 'failed' });
    mockEventUpdateMany.mockResolvedValue({ count: 1 });
    await expect(claimStripeEvent(ref)).resolves.toBe('claimed');
  });

  it('başka örnek işlerken gelen eşzamanlı teslim beklemeye alınır', async () => {
    mockEventCreate.mockRejectedValue({ code: 'P2002' });
    mockEventFindUnique.mockResolvedValue({ status: 'received' });
    mockEventUpdateMany.mockResolvedValue({ count: 0 });
    await expect(claimStripeEvent(ref)).resolves.toBe('in_progress');
  });

  it('P2002 dışındaki hatalar yutulmaz', async () => {
    mockEventCreate.mockRejectedValue(new Error('db down'));
    await expect(claimStripeEvent(ref)).rejects.toThrow('db down');
  });

  it('aynı abonelik için daha yeni işlenmiş olay varsa eski olay bayattır', async () => {
    mockEventFindFirst.mockResolvedValue({ id: 'evt_newer' });
    await expect(isStaleStripeEvent(ref)).resolves.toBe(true);
    expect(mockEventFindFirst.mock.calls[0][0].where).toMatchObject({
      objectId: 'sub_1',
      status: 'processed',
      stripeCreatedAt: { gt: new Date(1_800_000_000 * 1000) },
    });
    mockEventFindFirst.mockResolvedValue(null);
    await expect(isStaleStripeEvent(ref)).resolves.toBe(false);
  });

  it('bitiş durumu yazılır', async () => {
    mockEventUpdate.mockResolvedValue({});
    await finishStripeEvent('evt_1', 'processed');
    expect(mockEventUpdate.mock.calls[0][0].data.status).toBe('processed');
    expect(mockEventUpdate.mock.calls[0][0].data.processedAt).toBeInstanceOf(Date);
  });
});
