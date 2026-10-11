/**
 * Ayarlar › Abonelik okuma modeli.
 *
 *  - `loadBillingSummary`: yalnız DB (plan, durum, kota, planlar). Sayfa (RSC) ve
 *    `GET /api/dealer/billing` aynı fonksiyonu kullanır. `stripePriceId` istemciye sızmaz.
 *  - `loadBillingDetails`: Stripe CANLI (iptal dönem sonu, ödeme yöntemi, son faturalar).
 *    Ayrı uçtan, ertelenmiş yüklenir — Stripe yavaş/kapalıysa sayfanın geri kalanı etkilenmez.
 *  - `confirmCheckoutReturn`: Checkout dönüşünde oturumu doğrular ve webhook'u beklemeden
 *    aboneliği uzlaştırır (denetim B9: ödeme yapan bayi "Ücretsiz" görmesin).
 * Kota sayımı QR yüzeyiyle AYNI kaynaktan (`loadQrQuota`) gelir: iki ekran farklı sayı göstermez.
 */
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getDealerPlanLimits } from '@/lib/plan-limits';
import { BLOCKING_SUBSCRIPTION_STATUSES, syncSubscriptionToUser } from '@/lib/billing-core';
import { loadQrQuota } from '@/lib/dealer/qr-codes/load.server';

const CHANGEABLE = new Set(['active', 'trialing']);

export interface BillingPlan {
  id: string;
  name: string;
  description: string | null;
  /** En küçük para biriminde (kuruş) — kayan nokta gösterim hatası yok. */
  priceMinor: number;
  currency: string;
  interval: string;
  features: string[];
  maxQRCodes: number | null;
  maxBranches: number | null;
  isPopular: boolean;
  /** Stripe fiyatı bağlı ve abonelik modunda satın alınabilir. */
  payable: boolean;
}

export interface BillingSummary {
  stripeEnabled: boolean;
  current: {
    planId: string | null;
    planName: string;
    status: string | null;
    currentPeriodEnd: string | null;
    hasCustomer: boolean;
    hasSubscription: boolean;
    canChangePlan: boolean;
  };
  usage: {
    qr: { used: number; limit: number | null };
    branches: { used: number; limit: number | null };
  };
  plans: BillingPlan[];
}

export async function loadBillingSummary(dealerId: string): Promise<BillingSummary> {
  const [user, plans, limits, quota] = await Promise.all([
    prisma.user.findUnique({
      where: { id: dealerId },
      select: {
        pricingPlanId: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.pricingPlan.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: [{ order: 'asc' }, { price: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        interval: true,
        features: true,
        maxQRCodes: true,
        maxBranches: true,
        stripePriceId: true,
        isPopular: true,
      },
    }),
    getDealerPlanLimits(dealerId),
    loadQrQuota(dealerId),
  ]);

  const status = user?.subscriptionStatus ?? null;
  const hasSubscription = Boolean(user?.stripeSubscriptionId && status && BLOCKING_SUBSCRIPTION_STATUSES.has(status));

  return {
    stripeEnabled: isStripeConfigured(),
    current: {
      planId: user?.pricingPlanId ?? null,
      planName: limits.planName,
      status,
      currentPeriodEnd: user?.subscriptionCurrentPeriodEnd ? user.subscriptionCurrentPeriodEnd.toISOString() : null,
      hasCustomer: Boolean(user?.stripeCustomerId && user?.stripeSubscriptionId),
      hasSubscription,
      canChangePlan: hasSubscription && CHANGEABLE.has(status ?? ''),
    },
    usage: {
      qr: { used: quota.quota.used, limit: quota.quota.limit },
      branches: { used: quota.branchQuota.used, limit: quota.branchQuota.limit },
    },
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceMinor: Math.round(p.price * 100),
      currency: p.currency,
      interval: p.interval,
      features: Array.isArray(p.features)
        ? [...new Set(p.features.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => f.trim()))]
        : [],
      maxQRCodes: p.maxQRCodes,
      maxBranches: p.maxBranches,
      isPopular: p.isPopular,
      payable: Boolean(p.stripePriceId) && p.interval !== 'lifetime',
    })),
  };
}

export interface BillingInvoice {
  id: string;
  number: string | null;
  createdAt: string;
  amountMinor: number;
  currency: string;
  status: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface BillingDetails {
  available: boolean;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  trialEnd: string | null;
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  invoices: BillingInvoice[];
}

const EMPTY_DETAILS: BillingDetails = {
  available: false,
  cancelAtPeriodEnd: false,
  cancelAt: null,
  trialEnd: null,
  paymentMethod: null,
  invoices: [],
};

function cardOf(pm: unknown): BillingDetails['paymentMethod'] {
  if (!pm || typeof pm !== 'object') return null;
  const card = (pm as Stripe.PaymentMethod).card;
  if (!card) return null;
  return { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
}

/** Stripe canlı ayrıntıları. Stripe kapalı ya da müşteri yoksa `available: false`. */
export async function loadBillingDetails(dealerId: string): Promise<BillingDetails> {
  const stripe = getStripe();
  if (!stripe) return EMPTY_DETAILS;
  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!user?.stripeCustomerId) return { ...EMPTY_DETAILS, available: true };

  const [subscription, invoices, customer] = await Promise.all([
    user.stripeSubscriptionId
      ? stripe.subscriptions.retrieve(user.stripeSubscriptionId, { expand: ['default_payment_method'] }).catch(() => null)
      : Promise.resolve(null),
    stripe.invoices.list({ customer: user.stripeCustomerId, limit: 12 }),
    stripe.customers.retrieve(user.stripeCustomerId, { expand: ['invoice_settings.default_payment_method'] }).catch(() => null),
  ]);

  const subPm = subscription?.default_payment_method ?? null;
  const custPm =
    customer && !('deleted' in customer && customer.deleted)
      ? (customer as Stripe.Customer).invoice_settings?.default_payment_method ?? null
      : null;

  return {
    available: true,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
    cancelAt: subscription?.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
    trialEnd: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    paymentMethod: cardOf(subPm) ?? cardOf(custPm),
    invoices: invoices.data.map((inv) => ({
      id: inv.id ?? '',
      number: inv.number ?? null,
      createdAt: new Date(inv.created * 1000).toISOString(),
      amountMinor: inv.total ?? inv.amount_due ?? 0,
      currency: inv.currency,
      status: inv.status ?? null,
      hostedUrl: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
    })),
  };
}

export type CheckoutReturnState = 'active' | 'processing' | 'unpaid' | 'expired' | 'not_found';

/**
 * Checkout dönüşü: oturum bu bayiye mi ait → tamamlandıysa aboneliği Stripe'tan taze okuyup
 * uzlaştır (webhook ile aynı idempotent yol). Yabancı oturum `not_found` döner (sızıntı yok).
 */
export async function confirmCheckoutReturn(dealerId: string, sessionId: string): Promise<{ state: CheckoutReturnState; planId: string | null }> {
  const stripe = getStripe();
  if (!stripe) return { state: 'not_found', planId: null };
  const user = await prisma.user.findUnique({ where: { id: dealerId }, select: { stripeCustomerId: true } });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return { state: 'not_found', planId: null };
  }
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const owned = session.metadata?.dealerId === dealerId || (!!customerId && customerId === user?.stripeCustomerId);
  if (!owned) return { state: 'not_found', planId: null };

  if (session.status === 'expired') return { state: 'expired', planId: null };
  if (session.status !== 'complete') return { state: 'processing', planId: null };

  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    await syncSubscriptionToUser(sub);
  }
  const after = await prisma.user.findUnique({ where: { id: dealerId }, select: { pricingPlanId: true, subscriptionStatus: true } });
  const status = after?.subscriptionStatus ?? null;
  if (status === 'active' || status === 'trialing') return { state: 'active', planId: after?.pricingPlanId ?? null };
  if (session.payment_status === 'unpaid') return { state: 'unpaid', planId: null };
  return { state: 'processing', planId: after?.pricingPlanId ?? null };
}
