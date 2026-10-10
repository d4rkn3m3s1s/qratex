/**
 * Stripe abonelik iş mantığı (route'lardan ayrık, test edilebilir çekirdek).
 *
 * - ensureStripeCustomer: bayi için Stripe Customer oluşturur/getirir (eşzamanlı çağrıda da tek Customer).
 * - createCheckoutSession: YALNIZ aboneliği olmayan bayi için Stripe Checkout başlatır.
 *   Canlı aboneliği olan bayiye yeni Checkout AÇILMAZ (çift abonelik = çift ücret, P0-29).
 * - previewPlanChange / changeSubscriptionPlan: mevcut aboneliği `subscriptions.update` ile
 *   yeni fiyata taşır (prorasyon önizlemesi + aynı proration_date ile uygulama).
 * - createBillingPortalSession: bayinin aboneliğini yönetmesi için portal.
 * - syncSubscriptionToUser: webhook olayından sonra müşterinin abonelik durumunu Stripe'tan
 *   TAZE okuyup User'a uzlaştırır. Olay yükü kaynak-doğruluk sayılmaz → olay sırası ve
 *   yeniden denemeler planı geri yazamaz; başka (eski/yabancı) aboneliğin olayı mevcut
 *   ödenen planı silemez. Plan, abonelik metadata'sından değil FİYATTAN çözülür.
 * - claimStripeEvent / isStaleStripeEvent / finishStripeEvent: webhook idempotency +
 *   sıra koruması (StripeEvent tablosu).
 */
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe, getBillingReturnOrigin } from '@/lib/stripe';

/**
 * Plan ayrıcalığı veren durumlar. `past_due`: Stripe'ın akıllı yeniden deneme penceresi
 * (ödeme bir kez reddedildi diye bayi anında ücretsiz kademeye düşmez). Stripe denemeleri
 * bitirince aboneliği `unpaid`/`canceled` yapar → olay gelir → plan düşer.
 */
export const PLAN_GRANTING_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/**
 * Müşterinin hâlâ faturalanabilir ya da yeniden canlanabilir bir aboneliği var sayılan durumlar.
 * Bu durumlardan birinde abonelik varken yeni Checkout açılmaz (çift abonelik engeli).
 */
export const BLOCKING_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
]);

/** Plan değişikliğine izin verilen durumlar (ödemesi bekleyen abonelikte önce kart güncellenmeli). */
const CHANGEABLE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

/** Önizleme ile uygulama arasındaki proration_date en fazla bu kadar eski olabilir. */
const PRORATION_DATE_MAX_AGE_SEC = 60 * 60;

/** "received" durumunda takılı kalan (işleyen örnek çökmüş) olay bu süreden sonra devralınır. */
const STALE_CLAIM_MS = 2 * 60 * 1000;

export type BillingErrorCode =
  | 'STRIPE_DISABLED'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NOT_PAYABLE'
  | 'PLAN_ONE_TIME'
  | 'SUBSCRIPTION_EXISTS'
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_NOT_CHANGEABLE'
  | 'ALREADY_ON_PLAN'
  | 'PAYMENT_PENDING'
  | 'CUSTOMER_FAILED'
  | 'NO_URL';

export interface CheckoutResult {
  ok: boolean;
  url?: string;
  error?: string;
  code?: BillingErrorCode;
}

function fail(code: BillingErrorCode, error: string): { ok: false; code: BillingErrorCode; error: string } {
  return { ok: false, code, error };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

function customerIdOf(sub: Pick<Stripe.Subscription, 'customer'>): string | null {
  const c = sub.customer as unknown;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string') return (c as { id: string }).id;
  return null;
}

function priceIdOf(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const price = item?.price as unknown;
  if (typeof price === 'string') return price;
  if (price && typeof price === 'object' && typeof (price as { id?: unknown }).id === 'string') {
    return (price as { id: string }).id;
  }
  return null;
}

function newest(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  return [...subs].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0] ?? null;
}

/**
 * Bayi için Stripe Customer'ı garanti eder. Zaten varsa id'yi döndürür; yoksa oluşturup
 * User'a kaydeder. Eşzamanlı iki çağrı (iki sekme/çift tık) yetim Customer üretmez:
 * Stripe idempotency anahtarı aynı Customer'ı döndürür, DB yazımı koşulludur.
 */
export async function ensureStripeCustomer(dealerId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { id: true, email: true, name: true, businessName: true, stripeCustomerId: true },
  });
  if (!user) return null;
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.businessName || user.name || undefined,
      metadata: { dealerId: user.id },
    },
    { idempotencyKey: `qratex-customer-${user.id}` }
  );
  const written = await prisma.user.updateMany({
    where: { id: dealerId, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });
  if (written.count === 1) return customer.id;
  // Başka bir istek önce yazdı → kayıttaki değer kaynak-doğruluk.
  const again = await prisma.user.findUnique({ where: { id: dealerId }, select: { stripeCustomerId: true } });
  return again?.stripeCustomerId ?? customer.id;
}

type PayablePlan = { id: string; name: string; stripePriceId: string; interval: string };
type BillingFailure = ReturnType<typeof fail>;

async function loadPayablePlan(planId: string): Promise<{ plan: PayablePlan } | { error: BillingFailure }> {
  const plan = await prisma.pricingPlan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, stripePriceId: true, isActive: true, archivedAt: true, interval: true },
  });
  if (!plan || !plan.isActive || plan.archivedAt) return { error: fail('PLAN_NOT_FOUND', 'Plan bulunamadı') };
  if (!plan.stripePriceId) {
    return { error: fail('PLAN_NOT_PAYABLE', 'Bu plan için çevrim içi ödeme yapılandırılmamış') };
  }
  if (plan.interval === 'lifetime') {
    return {
      error: fail('PLAN_ONE_TIME', 'Tek seferlik planlar çevrim içi abonelikle satın alınamaz. Lütfen bizimle iletişime geçin.'),
    };
  }
  return { plan: { id: plan.id, name: plan.name, stripePriceId: plan.stripePriceId, interval: plan.interval } };
}

/**
 * Bir pricingPlan için Stripe Checkout (abonelik) oturumu oluşturur.
 *
 * Çift abonelik engeli (P0-29): bayinin DB'de ya da Stripe'ta (webhook henüz gelmemiş
 * olabilir) faturalanabilir bir aboneliği varsa Checkout AÇILMAZ → `SUBSCRIPTION_EXISTS`
 * (route 409 döner, arayüz "Planı değiştir" akışına yönlendirir).
 * Aynı plan için açık bir oturum varsa o döndürülür (çift tık); başka planların açık
 * oturumları kapatılır (iki sekmeden iki ödeme tamamlanamaz).
 */
export async function createCheckoutSession(dealerId: string, planId: string): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) return fail('STRIPE_DISABLED', 'Ödeme sistemi yapılandırılmamış');

  const loaded = await loadPayablePlan(planId);
  if ('error' in loaded) return loaded.error;
  const { plan } = loaded;

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { stripeSubscriptionId: true, subscriptionStatus: true },
  });
  if (!user) return fail('CUSTOMER_FAILED', 'Hesap bulunamadı');
  if (user.stripeSubscriptionId && BLOCKING_SUBSCRIPTION_STATUSES.has(user.subscriptionStatus ?? '')) {
    return fail(
      'SUBSCRIPTION_EXISTS',
      'Zaten bir aboneliğiniz var. Yeni abonelik açmak yerine "Planı değiştir" ile mevcut aboneliğinizi güncelleyin.'
    );
  }

  const customerId = await ensureStripeCustomer(dealerId);
  if (!customerId) return fail('CUSTOMER_FAILED', 'Müşteri kaydı oluşturulamadı');

  // Stripe'taki gerçek durum: webhook gecikmesi ya da kaçan olay DB'yi eski bırakmış olabilir.
  const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  if (existing.data.some((s) => BLOCKING_SUBSCRIPTION_STATUSES.has(s.status))) {
    return fail(
      'SUBSCRIPTION_EXISTS',
      'Zaten bir aboneliğiniz var. Yeni abonelik açmak yerine "Planı değiştir" ile mevcut aboneliğinizi güncelleyin.'
    );
  }

  // Açık Checkout oturumları: aynı plan → yeniden kullan; diğerleri → kapat.
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 10 });
  const reusable = open.data.find((s) => s.mode === 'subscription' && s.metadata?.planId === plan.id && s.url);
  for (const s of open.data) {
    if (s.id === reusable?.id) continue;
    try {
      await stripe.checkout.sessions.expire(s.id);
    } catch (err) {
      console.warn('[BILLING_CHECKOUT] açık oturum kapatılamadı:', s.id, err instanceof Error ? err.message : err);
    }
  }
  if (reusable?.url) return { ok: true, url: reusable.url };

  const origin = getBillingReturnOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${origin}/dealer/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dealer/billing?status=cancel`,
    // planId yalnız bilgi amaçlı; plan webhook'ta FİYATTAN çözülür.
    metadata: { dealerId, planId: plan.id },
    subscription_data: { metadata: { dealerId, planId: plan.id } },
    allow_promotion_codes: true,
  });

  return session.url ? { ok: true, url: session.url } : fail('NO_URL', 'Ödeme oturumu adresi alınamadı');
}

interface ChangeContext {
  stripe: Stripe;
  plan: { id: string; name: string; stripePriceId: string };
  subscription: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  customerId: string;
}

async function loadChangeContext(
  dealerId: string,
  planId: string
): Promise<{ ctx: ChangeContext } | { error: ReturnType<typeof fail> }> {
  const stripe = getStripe();
  if (!stripe) return { error: fail('STRIPE_DISABLED', 'Ödeme sistemi yapılandırılmamış') };

  const loaded = await loadPayablePlan(planId);
  if ('error' in loaded) return { error: loaded.error };

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { stripeSubscriptionId: true, stripeCustomerId: true },
  });
  if (!user?.stripeSubscriptionId || !user.stripeCustomerId) {
    return { error: fail('NO_SUBSCRIPTION', 'Aktif bir aboneliğiniz yok. Önce bir plan satın alın.') };
  }

  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  if (customerIdOf(subscription) !== user.stripeCustomerId) {
    // Kayıtlı abonelik bu bayinin müşterisine ait değil → asla başkasının aboneliğini değiştirme.
    return { error: fail('NO_SUBSCRIPTION', 'Abonelik kaydınız doğrulanamadı. Lütfen destekle iletişime geçin.') };
  }
  if (!CHANGEABLE_STATUSES.has(subscription.status)) {
    return {
      error: fail(
        'SUBSCRIPTION_NOT_CHANGEABLE',
        subscription.status === 'past_due' || subscription.status === 'unpaid'
          ? 'Bekleyen bir ödemeniz var. Plan değiştirmeden önce "Aboneliği yönet" ile ödeme yönteminizi güncelleyin.'
          : 'Aboneliğiniz şu an değiştirilemez durumda.'
      ),
    };
  }
  const item = subscription.items?.data?.[0];
  if (!item) return { error: fail('NO_SUBSCRIPTION', 'Abonelik kalemi bulunamadı') };
  if (priceIdOf(subscription) === loaded.plan.stripePriceId) {
    return { error: fail('ALREADY_ON_PLAN', 'Zaten bu plandasınız') };
  }
  return {
    ctx: {
      stripe,
      plan: { id: loaded.plan.id, name: loaded.plan.name, stripePriceId: loaded.plan.stripePriceId },
      subscription,
      item,
      customerId: user.stripeCustomerId,
    },
  };
}

export interface PlanChangePreview {
  planId: string;
  planName: string;
  /** Prorasyon (hemen tahsil edilecek; negatifse hesaba alacak) — en küçük para biriminde (kuruş). */
  prorationAmount: number;
  /** Sonraki normal dönem faturası (prorasyon hariç) — en küçük para biriminde. */
  nextPeriodAmount: number;
  currency: string;
  /** Uygulamada aynı değer gönderilmeli (önizleme = tahsilat). Unix saniye. */
  prorationDate: number;
  /** Dönem sonu (ISO). */
  currentPeriodEnd: string | null;
}

export type PlanChangePreviewResult = { ok: true; preview: PlanChangePreview } | ReturnType<typeof fail>;

/** Plan değişikliğinin parasal etkisini önizler (Stripe invoice preview). */
export async function previewPlanChange(dealerId: string, planId: string): Promise<PlanChangePreviewResult> {
  const loaded = await loadChangeContext(dealerId, planId);
  if ('error' in loaded) return loaded.error;
  const { stripe, plan, subscription, item, customerId } = loaded.ctx;

  const prorationDate = Math.floor(Date.now() / 1000);
  const invoice = await stripe.invoices.createPreview({
    customer: customerId,
    subscription: subscription.id,
    subscription_details: {
      items: [{ id: item.id, price: plan.stripePriceId }],
      proration_behavior: 'create_prorations',
      proration_date: prorationDate,
    },
  });

  let prorationAmount = 0;
  let nextPeriodAmount = 0;
  for (const line of invoice.lines?.data ?? []) {
    // Stripe önerisi: yalnız period.start === proration_date olan prorasyon satırları bu değişikliğe aittir.
    if (line.proration && line.period?.start === prorationDate) prorationAmount += line.amount;
    else if (!line.proration) nextPeriodAmount += line.amount;
  }

  return {
    ok: true,
    preview: {
      planId: plan.id,
      planName: plan.name,
      prorationAmount,
      nextPeriodAmount,
      currency: invoice.currency,
      prorationDate,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    },
  };
}

export type PlanChangeResult =
  | { ok: true; planId: string; status: string }
  | ReturnType<typeof fail>;

/**
 * Mevcut aboneliği yeni plana taşır (`subscriptions.update`; yeni abonelik AÇMAZ).
 * Prorasyon hemen faturalanır; `pending_if_incomplete` ile ödeme alınamazsa değişiklik
 * uygulanmaz (ödenmeyen yükseltme kota vermez). Aynı `prorationDate` ile gelen tekrar
 * istekleri Stripe idempotency anahtarıyla tek işleme iner.
 */
export async function changeSubscriptionPlan(
  dealerId: string,
  planId: string,
  opts: { prorationDate?: number } = {}
): Promise<PlanChangeResult> {
  const loaded = await loadChangeContext(dealerId, planId);
  if ('error' in loaded) return loaded.error;
  const { stripe, plan, subscription, item } = loaded.ctx;

  const nowSec = Math.floor(Date.now() / 1000);
  const requested = opts.prorationDate;
  const prorationDate =
    typeof requested === 'number' &&
    Number.isInteger(requested) &&
    requested <= nowSec + 60 &&
    requested >= nowSec - PRORATION_DATE_MAX_AGE_SEC
      ? requested
      : nowSec;

  const updated = await stripe.subscriptions.update(
    subscription.id,
    {
      items: [{ id: item.id, price: plan.stripePriceId }],
      proration_behavior: 'always_invoice',
      proration_date: prorationDate,
      payment_behavior: 'pending_if_incomplete',
    },
    { idempotencyKey: `qratex-plan-change:${subscription.id}:${item.id}:${plan.stripePriceId}:${prorationDate}` }
  );

  if (updated.pending_update) {
    return fail(
      'PAYMENT_PENDING',
      'Ödeme tamamlanamadı; planınız değişmedi. "Aboneliği yönet" ile kartınızı güncelleyip tekrar deneyin.'
    );
  }

  // Webhook'u beklemeden durumu uzlaştır (webhook da gelir; işlem idempotent).
  const outcome = await syncSubscriptionToUser(updated);
  return { ok: true, planId: outcome.planId ?? plan.id, status: updated.status };
}

/** Bayinin Stripe Billing Portal oturumu (abonelik yönet/iptal). */
export async function createBillingPortalSession(dealerId: string): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) return fail('STRIPE_DISABLED', 'Ödeme sistemi yapılandırılmamış');

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) return fail('NO_SUBSCRIPTION', 'Aktif aboneliğiniz yok');

  const origin = getBillingReturnOrigin();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/dealer/billing`,
  });
  return { ok: true, url: portal.url };
}

export interface SyncOutcome {
  status: 'applied' | 'ignored';
  reason?: 'user_not_found' | 'customer_mismatch' | 'foreign_subscription';
  dealerId?: string;
  subscriptionId?: string;
  planId?: string | null;
  duplicate?: boolean;
}

const USER_SYNC_SELECT = {
  id: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  subscriptionStatus: true,
  pricingPlanId: true,
} as const;

/**
 * Bir abonelik olayından sonra müşterinin abonelik durumunu User'a uzlaştırır.
 *
 * Kaynak-doğruluk Stripe'ın GÜNCEL durumudur (olay yükü değil): müşterinin abonelikleri
 * taze listelenir ve yetkili abonelik seçilir:
 *  1. Kayıtlı abonelik hâlâ plan veriyorsa o kalır.
 *  2. Değilse en yeni plan veren abonelik benimsenir (iptalden sonra yeniden abonelik).
 *  3. Hiçbiri plan vermiyorsa kayıtlı aboneliğin durumu yazılır (plan düşer).
 * Böylece eski aboneliğin olayı, sırası karışmış ya da yeniden denenmiş bir olay ödenen
 * planı geri yazamaz/silemez. Birden çok plan veren abonelik = çift ücret → denetim kaydı.
 * Plan, abonelik kalemindeki FİYATIN `PricingPlan.stripePriceId` eşlemesiyle çözülür.
 */
export async function syncSubscriptionToUser(incoming: Stripe.Subscription): Promise<SyncOutcome> {
  const customerId = customerIdOf(incoming);
  const metaDealerId = incoming.metadata?.dealerId || null;

  let user = metaDealerId
    ? await prisma.user.findUnique({ where: { id: metaDealerId }, select: USER_SYNC_SELECT })
    : null;
  if (!user && customerId) {
    user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: USER_SYNC_SELECT });
  }
  if (!user) {
    // Silinmiş bayi vb. → 500 verip Stripe'ı 3 gün yeniden denemeye sokma.
    console.warn('[BILLING_SYNC] abonelik için bayi bulunamadı:', incoming.id);
    return { status: 'ignored', reason: 'user_not_found', subscriptionId: incoming.id };
  }
  if (user.stripeCustomerId && customerId && user.stripeCustomerId !== customerId) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'subscription_event_ignored',
        entity: 'User',
        entityId: user.id,
        newData: { reason: 'customer_mismatch', subscriptionId: incoming.id, customerId } as object,
      },
    });
    return { status: 'ignored', reason: 'customer_mismatch', dealerId: user.id, subscriptionId: incoming.id };
  }

  const stripe = getStripe();
  const fresh =
    stripe && customerId
      ? (await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 })).data
      : null;
  const usingFresh = !!fresh && fresh.length > 0;
  const pool: Stripe.Subscription[] = usingFresh && fresh ? fresh : [incoming];

  const currentId = user.stripeSubscriptionId;
  const currentInPool = currentId ? pool.find((s) => s.id === currentId) ?? null : null;
  // Taze liste yoksa kayıtlı aboneliğin bilinen durumu tek bilgi kaynağıdır.
  const currentGrantingByDb =
    !usingFresh && !!currentId && currentId !== incoming.id && PLAN_GRANTING_STATUSES.has(user.subscriptionStatus ?? '');
  const grantingPool = pool.filter((s) => PLAN_GRANTING_STATUSES.has(s.status));

  let chosen: Stripe.Subscription | null;
  if (currentInPool && PLAN_GRANTING_STATUSES.has(currentInPool.status)) chosen = currentInPool;
  else if (currentGrantingByDb) chosen = null;
  else if (grantingPool.length > 0) chosen = newest(grantingPool);
  else if (currentInPool) chosen = currentInPool;
  else if (!usingFresh && currentId && currentId !== incoming.id) chosen = null;
  else chosen = pool.find((s) => s.id === incoming.id) ?? newest(pool);

  const duplicateIds = usingFresh
    ? grantingPool.map((s) => s.id)
    : currentGrantingByDb && PLAN_GRANTING_STATUSES.has(incoming.status)
      ? [currentId as string, incoming.id]
      : [];
  const duplicate = duplicateIds.length > 1;
  if (duplicate) {
    console.error('[BILLING_SYNC] birden çok plan veren abonelik (çift ücret):', user.id, duplicateIds);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'subscription_duplicate_detected',
        entity: 'User',
        entityId: user.id,
        newData: { subscriptionIds: duplicateIds, keptSubscriptionId: chosen?.id ?? currentId } as object,
      },
    });
  }

  if (!chosen) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'subscription_event_ignored',
        entity: 'User',
        entityId: user.id,
        newData: {
          reason: 'foreign_subscription',
          subscriptionId: incoming.id,
          status: incoming.status,
          currentSubscriptionId: currentId,
        } as object,
      },
    });
    return {
      status: 'ignored',
      reason: 'foreign_subscription',
      dealerId: user.id,
      subscriptionId: incoming.id,
      duplicate,
    };
  }

  const grants = PLAN_GRANTING_STATUSES.has(chosen.status);
  let planId: string | null = null;
  let unmappedPriceId: string | null = null;
  if (grants) {
    const priceId = priceIdOf(chosen);
    const plan = priceId
      ? await prisma.pricingPlan.findFirst({ where: { stripePriceId: priceId }, select: { id: true } })
      : null;
    if (plan) {
      planId = plan.id;
    } else {
      // Eşlenmeyen fiyat (yönetici yapılandırma hatası): ödeme yapan bayiyi düşürme;
      // aynı abonelikse mevcut planı koru, denetime düş.
      unmappedPriceId = priceId ?? 'unknown';
      planId = chosen.id === currentId ? user.pricingPlanId : null;
    }
  }
  const periodEnd = chosen.current_period_end ? new Date(chosen.current_period_end * 1000) : null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: chosen.id,
      subscriptionStatus: chosen.status,
      subscriptionCurrentPeriodEnd: periodEnd,
      pricingPlanId: planId,
      ...(customerId && !user.stripeCustomerId ? { stripeCustomerId: customerId } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: unmappedPriceId ? 'subscription_price_unmapped' : 'subscription_synced',
      entity: 'User',
      entityId: user.id,
      newData: {
        subscriptionId: chosen.id,
        status: chosen.status,
        planId,
        ...(unmappedPriceId ? { priceId: unmappedPriceId } : {}),
        triggeredBy: incoming.id,
      } as object,
    },
  });

  return { status: 'applied', dealerId: user.id, subscriptionId: chosen.id, planId, duplicate };
}

// ───────────────────────────── Webhook idempotency + sıra ─────────────────────────────

export interface StripeEventRef {
  id: string;
  type: string;
  /** Stripe event.created (Unix saniye). */
  created: number;
  objectId: string | null;
}

export type StripeEventClaim = 'claimed' | 'duplicate' | 'in_progress';

/**
 * Olayı işlemek için atomik olarak sahiplenir.
 *  - İlk teslim: satır oluşturulur → `claimed`.
 *  - Zaten işlenmiş/yok sayılmış: `duplicate` (200 dön, yeniden işleme).
 *  - Önceki deneme `failed` ya da çökmüş (`received`, 2 dk'dan eski): koşullu güncelleme ile
 *    tek bir örnek devralır → `claimed`.
 *  - Başka bir örnek şu an işliyor: `in_progress` (non-2xx dön; Stripe sonra yeniden dener).
 * `createdAt` burada "son sahiplenme zamanı" olarak kullanılır.
 */
export async function claimStripeEvent(ref: StripeEventRef): Promise<StripeEventClaim> {
  try {
    await prisma.stripeEvent.create({
      data: {
        id: ref.id,
        type: ref.type,
        objectId: ref.objectId,
        stripeCreatedAt: new Date(ref.created * 1000),
        status: 'received',
      },
    });
    return 'claimed';
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }

  const existing = await prisma.stripeEvent.findUnique({ where: { id: ref.id }, select: { status: true } });
  if (existing && (existing.status === 'processed' || existing.status === 'ignored')) return 'duplicate';

  const now = new Date();
  const reclaimed = await prisma.stripeEvent.updateMany({
    where: {
      id: ref.id,
      OR: [{ status: 'failed' }, { status: 'received', createdAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } }],
    },
    data: { status: 'received', createdAt: now, error: null },
  });
  return reclaimed.count === 1 ? 'claimed' : 'in_progress';
}

/**
 * Sıra koruması: aynı nesne (abonelik) için bu olaydan DAHA YENİ bir olay zaten işlendiyse
 * bu olay bayattır; işlenmez (eski durum yeniyi ezmez).
 */
export async function isStaleStripeEvent(ref: StripeEventRef): Promise<boolean> {
  if (!ref.objectId) return false;
  const newer = await prisma.stripeEvent.findFirst({
    where: {
      objectId: ref.objectId,
      status: 'processed',
      stripeCreatedAt: { gt: new Date(ref.created * 1000) },
      NOT: { id: ref.id },
    },
    select: { id: true },
  });
  return newer !== null;
}

export async function finishStripeEvent(
  id: string,
  status: 'processed' | 'ignored' | 'failed',
  error?: string
): Promise<void> {
  await prisma.stripeEvent.update({
    where: { id },
    data: {
      status,
      error: error ? error.slice(0, 1000) : null,
      processedAt: status === 'failed' ? null : new Date(),
    },
  });
}
