import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import {
  claimStripeEvent,
  finishStripeEvent,
  isStaleStripeEvent,
  syncSubscriptionToUser,
  type StripeEventRef,
  type SyncOutcome,
} from '@/lib/billing-core';
import { prisma } from '@/lib/prisma';

// Stripe imza doğrulaması için HAM gövde gerekir → bu route'ta body parse edilmemeli.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/webhooks/stripe — Stripe abonelik olaylarını işler.
 *
 * 1. İmza doğrulanır (STRIPE_WEBHOOK_SECRET).
 * 2. Idempotency (P0-29): olay `StripeEvent` tablosunda atomik sahiplenilir; işlenmiş olay
 *    tekrar gelirse (Stripe retry) yeniden işlenmez. Aynı anda iki teslim tek işleme iner.
 * 3. Sıra koruması: aynı abonelik için daha yeni bir olay zaten işlendiyse eski olay atlanır.
 * 4. İşleme: abonelik durumu Stripe'tan TAZE okunup uzlaştırılır (olay yükü kaynak-doğruluk
 *    değildir) → sırası karışmış/yeniden denenmiş olay ödenen planı geri yazamaz.
 */
const HANDLED_EVENTS = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

function subscriptionIdOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

/** Sıra koruması için olayın ilgili olduğu abonelik kimliği. */
function objectIdOf(event: Stripe.Event): string | null {
  if (event.type === 'checkout.session.completed') {
    return subscriptionIdOf((event.data.object as Stripe.Checkout.Session).subscription);
  }
  if (event.type.startsWith('customer.subscription.')) {
    return (event.data.object as Stripe.Subscription).id ?? null;
  }
  return null;
}

async function processEvent(stripe: Stripe, event: Stripe.Event): Promise<SyncOutcome | null> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const subId = session.mode === 'subscription' ? subscriptionIdOf(session.subscription) : null;
    if (!subId) return null; // abonelik dışı oturum: ilgilenmiyoruz
    const sub = await stripe.subscriptions.retrieve(subId);
    return syncSubscriptionToUser(sub);
  }
  // customer.subscription.*: yük yalnız tetikleyicidir; uzlaştırma taze listeyle yapılır.
  return syncSubscriptionToUser(event.data.object as Stripe.Subscription);
}

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

  const ref: StripeEventRef = {
    id: event.id,
    type: event.type,
    created: event.created,
    objectId: objectIdOf(event),
  };

  let claim;
  try {
    claim = await claimStripeEvent(ref);
  } catch (e) {
    console.error('[STRIPE_WEBHOOK] olay kaydı yazılamadı:', event.id, e);
    return NextResponse.json({ error: 'Geçici hata' }, { status: 503 });
  }
  if (claim === 'duplicate') {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim === 'in_progress') {
    // Başka bir örnek şu an işliyor → non-2xx: Stripe daha sonra yeniden dener.
    return NextResponse.json({ error: 'Olay işleniyor' }, { status: 409 });
  }

  try {
    if (await isStaleStripeEvent(ref)) {
      await finishStripeEvent(event.id, 'ignored', 'stale: daha yeni bir olay zaten işlendi');
      return NextResponse.json({ received: true, stale: true });
    }

    const outcome = await processEvent(stripe, event);
    await finishStripeEvent(
      event.id,
      outcome && outcome.status === 'applied' ? 'processed' : 'ignored',
      outcome?.status === 'ignored' ? outcome.reason : outcome ? undefined : 'not_applicable'
    );
  } catch (e) {
    console.error('[STRIPE_WEBHOOK] işleme hatası:', event.type, event.id, e);
    try {
      await finishStripeEvent(event.id, 'failed', e instanceof Error ? e.message : String(e));
    } catch {
      /* kayıt güncellenemezse 2 dk sonra devralınır */
    }
    // 500 → Stripe yeniden dener (geçici hata olabilir).
    return NextResponse.json({ error: 'İşlenemedi' }, { status: 500 });
  }

  // İşlenen olayı ürün analitiğine logla (görünürlük; kritik değil).
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
