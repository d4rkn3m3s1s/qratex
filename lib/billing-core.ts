/**
 * Stripe abonelik iş mantığı (route'lardan ayrık, test edilebilir çekirdek).
 *
 * - ensureStripeCustomer: bayi için Stripe Customer oluşturur/getirir (idempotent).
 * - createCheckoutSession: bir plana abonelik için Stripe Checkout başlatır.
 * - createBillingPortalSession: bayinin aboneliğini yönetmesi için portal.
 * - syncSubscriptionToUser: webhook olayından gelen abonelik durumunu User'a yazar
 *   + abonelik aktifse ilgili pricingPlan'ı otomatik atar (kota uygulaması devreye girer).
 */
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe, getBillingReturnOrigin } from '@/lib/stripe';

/** Abonelik "etkin" sayılan durumlar (plan ayrıcalıkları verilir). */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/**
 * Bayi için Stripe Customer'ı garanti eder. Zaten varsa id'yi döndürür; yoksa
 * oluşturup User'a kaydeder. Idempotent.
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

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.businessName || user.name || undefined,
    metadata: { dealerId: user.id },
  });
  await prisma.user.update({ where: { id: dealerId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export interface CheckoutResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Bir pricingPlan için Stripe Checkout (abonelik) oturumu oluşturur.
 * Plan'ın stripePriceId'si yoksa veya Stripe kapalıysa hata döner.
 */
export async function createCheckoutSession(dealerId: string, planId: string): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'Ödeme sistemi yapılandırılmamış' };

  const plan = await prisma.pricingPlan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, stripePriceId: true, isActive: true },
  });
  if (!plan || !plan.isActive) return { ok: false, error: 'Plan bulunamadı' };
  if (!plan.stripePriceId) return { ok: false, error: 'Bu plan için ödeme yapılandırılmamış' };

  const customerId = await ensureStripeCustomer(dealerId);
  if (!customerId) return { ok: false, error: 'Müşteri kaydı oluşturulamadı' };

  const origin = getBillingReturnOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${origin}/dealer/billing?status=success`,
    cancel_url: `${origin}/dealer/billing?status=cancel`,
    metadata: { dealerId, planId: plan.id },
    subscription_data: { metadata: { dealerId, planId: plan.id } },
    allow_promotion_codes: true,
  });

  return session.url ? { ok: true, url: session.url } : { ok: false, error: 'Oturum URL alınamadı' };
}

/** Bayinin Stripe Billing Portal oturumu (abonelik yönet/iptal). */
export async function createBillingPortalSession(dealerId: string): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'Ödeme sistemi yapılandırılmamış' };

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) return { ok: false, error: 'Aktif aboneliğiniz yok' };

  const origin = getBillingReturnOrigin();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/dealer/billing`,
  });
  return { ok: true, url: portal.url };
}

/**
 * Webhook'tan gelen Stripe Subscription'ı User'a yazar. Abonelik etkinse
 * (active/trialing) metadata'daki planId'ye göre pricingPlan'ı atar; değilse
 * planı kaldırır (ücretsiz kademeye düşer). Saf veri eşlemesi — test edilebilir.
 */
export async function syncSubscriptionToUser(subscription: Stripe.Subscription): Promise<void> {
  const dealerId = subscription.metadata?.dealerId;
  if (!dealerId) {
    console.warn('[BILLING_SYNC] subscription metadata.dealerId yok:', subscription.id);
    return;
  }

  const isActive = ACTIVE_STATUSES.has(subscription.status);
  const planId = subscription.metadata?.planId || null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  await prisma.user.update({
    where: { id: dealerId },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: periodEnd,
      // Abonelik etkinse planı ata; değilse (iptal/past_due) ücretsiz kademeye düşür.
      pricingPlanId: isActive && planId ? planId : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: dealerId,
      action: 'subscription_synced',
      entity: 'User',
      entityId: dealerId,
      newData: { status: subscription.status, planId: isActive ? planId : null } as object,
    },
  });
}
