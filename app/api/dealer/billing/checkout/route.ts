import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { createCheckoutSession } from '@/lib/billing-core';
import { isStripeConfigured } from '@/lib/stripe';
import { checkRateLimitDb } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const schema = z.object({ planId: z.string().trim().min(1).max(64) });

/**
 * POST /api/dealer/billing/checkout — aboneliği OLMAYAN bayi bir plana abone olmak için
 * Stripe Checkout oturumu başlatır. Döner: { url } (istemci yönlendirir). Aboneliği olan
 * bayi için 409 SUBSCRIPTION_EXISTS → plan değişikliği /api/dealer/billing/change-plan ile.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Ödeme sistemi şu an kullanılamıyor' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const rl = await checkRateLimitDb(`billing_checkout:${auth.session.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Çok fazla deneme. Lütfen bekleyin.' },
      { status: 429, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'planId gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  try {
    const result = await createCheckoutSession(auth.session.user.id, parsed.data.planId);
    if (!result.ok) {
      // Canlı aboneliği olan bayiye yeni Checkout açılmaz (çift abonelik, P0-29) → 409 + kod;
      // arayüz "Planı değiştir" (subscriptions.update) akışına yönlendirir.
      const status = result.code === 'SUBSCRIPTION_EXISTS' ? 409 : result.code === 'STRIPE_DISABLED' ? 503 : 400;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    return NextResponse.json({ success: true, url: result.url }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('[BILLING_CHECKOUT]', e);
    return NextResponse.json(
      { error: 'Ödeme oturumu başlatılamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
