import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { createBillingPortalSession } from '@/lib/billing-core';
import { isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/billing/portal — bayinin aboneliğini yönetmesi (iptal, kart
 * güncelleme) için Stripe Billing Portal oturumu. Döner: { url }.
 */
export async function POST() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  // Her çağrı Stripe'ta yeni portal oturumu açar: dış API kotası için sıkı sınır.
  const limited = await enforceRouteRateLimit('dealer.billing.portal', auth.session.user.id, { max: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Ödeme sistemi şu an kullanılamıyor' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  try {
    const result = await createBillingPortalSession(auth.session.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ success: true, url: result.url }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('[BILLING_PORTAL]', e);
    return NextResponse.json(
      { error: 'Yönetim portalı açılamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
