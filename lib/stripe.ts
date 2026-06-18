/**
 * Stripe istemcisi ve yapılandırma yardımcıları.
 *
 * Stripe opsiyoneldir: STRIPE_SECRET_KEY yoksa billing özellikleri zarifçe devre
 * dışı kalır (uygulama Stripe olmadan da tam çalışır — plan kotası lib/plan-limits
 * ile uygulanmaya devam eder, sadece self-servis ödeme kapalı olur).
 */
import Stripe from 'stripe';

let cached: Stripe | null = null;

/** Stripe yapılandırılmış mı (secret key var mı)? */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/**
 * Stripe istemcisini döndürür. Yapılandırılmamışsa null — çağıran taraf bunu
 * kontrol edip 503/uygun yanıt vermelidir.
 */
export function getStripe(): Stripe | null {
  if (!isStripeConfigured()) return null;
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }
  return cached;
}

/** Webhook imza doğrulama sırrı (Stripe Dashboard'dan). */
export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

/** Checkout sonrası dönülecek başarı/iptal URL kökü. */
export function getBillingReturnOrigin(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'http://localhost:3000'
  );
}
