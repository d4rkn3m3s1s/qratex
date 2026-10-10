import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { isStripeConfigured } from '@/lib/stripe';
import { getDealerPlanLimits } from '@/lib/plan-limits';
import { BLOCKING_SUBSCRIPTION_STATUSES } from '@/lib/billing-core';

export const dynamic = 'force-dynamic';

/** Plan değişikliğine izin verilen abonelik durumları (lib/billing-core ile aynı kural). */
const CHANGEABLE = new Set(['active', 'trialing']);

/**
 * GET /api/dealer/billing — bayinin abonelik durumu + seçilebilir planlar +
 * mevcut kota limitleri. Billing sayfasını besler.
 *
 * `current.hasSubscription`: faturalanabilir bir abonelik var → yeni Checkout değil
 * "Planı değiştir" akışı kullanılır (çift abonelik engeli, P0-29).
 */
export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  try {
    const [user, plans, limits, qrUsed, qrLive] = await Promise.all([
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
      // Kota sayımı lib/plan-limits.canCreateQRCode ile aynı (arşiv ve iptal dahil, P0-24).
      prisma.qRCode.count({ where: { dealerId } }),
      prisma.qRCode.count({ where: { dealerId, revokedAt: null, archivedAt: null } }),
    ]);

    const status = user?.subscriptionStatus ?? null;
    const hasSubscription = Boolean(user?.stripeSubscriptionId && status && BLOCKING_SUBSCRIPTION_STATUSES.has(status));

    return NextResponse.json(
      {
        stripeEnabled: isStripeConfigured(),
        current: {
          planId: user?.pricingPlanId ?? null,
          status,
          currentPeriodEnd: user?.subscriptionCurrentPeriodEnd ?? null,
          // Portal yalnız gerçekten bir aboneliği/abonelik geçmişi olan bayiye anlamlı.
          hasCustomer: Boolean(user?.stripeCustomerId && user?.stripeSubscriptionId),
          hasSubscription,
          canChangePlan: hasSubscription && CHANGEABLE.has(status ?? ''),
        },
        limits,
        usage: { qrCodes: qrUsed, liveQrCodes: qrLive },
        // stripePriceId'yi UI'a sızdırma; sadece "ödenebilir mi" bayrağı.
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
          interval: p.interval,
          features: Array.isArray(p.features) ? p.features.filter((f): f is string => typeof f === 'string') : [],
          maxQRCodes: p.maxQRCodes,
          maxBranches: p.maxBranches,
          isPopular: p.isPopular,
          payable: Boolean(p.stripePriceId) && p.interval !== 'lifetime',
        })),
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[BILLING_GET]', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Abonelik bilgileri yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
