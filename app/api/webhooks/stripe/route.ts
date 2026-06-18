import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import { syncSubscriptionToUser } from '@/lib/billing-core';
import { prisma } from '@/lib/prisma';

// Stripe imza doğrulaması için HAM gövde gerekir → bu route'ta body parse edilmemeli.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/webhooks/stripe — Stripe abonelik olaylarını işler.
 * İmza doğrulanır (STRIPE_WEBHOOK_SECRET); abonelik durum değişiklikleri User'a
 * senkronlanır (plan otomatik atama/kaldırma). Idempotent: aynı event tekrar
 * gelirse (Stripe retry) güvenle yeniden işlenir.
 */
const HANDLED_EVENTS = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook yapılandırılmamış' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'İmza yok' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.warn('[STRIPE_WEBHOOK] imza doğrulanamadı:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'İmza geçersiz' }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    // İlgilenmediğimiz olayları 200 ile onayla (Stripe retry yapmasın).
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Checkout tamamlandı → abonelik nesnesini çekip senkronla.
        if (session.subscription && typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await syncSubscriptionToUser(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscriptionToUser(event.data.object as Stripe.Subscription);
        break;
      }
    }
  } catch (e) {
    console.error('[STRIPE_WEBHOOK] işleme hatası:', event.type, e);
    // 500 → Stripe yeniden dener (geçici hata olabilir).
    return NextResponse.json({ error: 'İşlenemedi' }, { status: 500 });
  }

  // İşlenen olayı denetim için logla (görünürlük).
  try {
    await prisma.analyticsEvent.create({
      data: {
        event: 'stripe_webhook',
        category: 'billing',
        data: { type: event.type, eventId: event.id },
      },
    });
  } catch { /* non-critical */ }

  return NextResponse.json({ received: true });
}
