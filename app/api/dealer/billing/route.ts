import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { isStripeConfigured } from '@/lib/stripe';
import { getDealerPlanLimits } from '@/lib/plan-limits';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/billing — bayinin abonelik durumu + seçilebilir planlar +
 * mevcut kota limitleri. Billing sayfasını besler.
 */
export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const [user, plans, limits, qrUsed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: dealerId },
      select: {
        pricingPlanId: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        stripeCustomerId: true,
      },
    }),
    prisma.pricingPlan.findMany({
      where: { isActive: true },
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
    prisma.qRCode.count({ where: { dealerId } }),
  ]);

  return NextResponse.json(
    {
      stripeEnabled: isStripeConfigured(),
      current: {
        planId: user?.pricingPlanId ?? null,
        status: user?.subscriptionStatus ?? null,
        currentPeriodEnd: user?.subscriptionCurrentPeriodEnd ?? null,
        hasCustomer: Boolean(user?.stripeCustomerId),
      },
      limits,
      usage: { qrCodes: qrUsed },
      // stripePriceId'yi UI'a sızdırma; sadece "ödenebilir mi" bayrağı.
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        interval: p.interval,
        features: Array.isArray(p.features) ? p.features : [],
        maxQRCodes: p.maxQRCodes,
        maxBranches: p.maxBranches,
        isPopular: p.isPopular,
        payable: Boolean(p.stripePriceId),
      })),
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
