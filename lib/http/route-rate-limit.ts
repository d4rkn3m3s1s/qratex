/**
 * Eski (defineRoute'a taşınmamış) route'lar için oran sınırı — `defineRoute`'un 3. adımıyla
 * AYNI kova adı ve politika tablosu (`route:<ad>:u:<kullanıcı>`), böylece bir uç sonradan
 * defineRoute'a taşındığında sayaç sürekliliği korunur.
 *
 *   const limited = await enforceRouteRateLimit('dealer.incidents.create', auth.session.user.id, 'mutation');
 *   if (limited) return limited;
 *
 * Sayaç altyapısı (Redis/DB) çökerse istek KESİLMEZ (fail-open, defineRoute ile aynı karar) ama
 * uyarı loglanır: oran sınırı kötüye kullanım tavanıdır, yetki kontrolü değildir.
 */
import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { RATE_LIMIT_POLICIES, type RateLimitPolicy, type RateLimitPolicyName } from '@/lib/http/define-route';

export async function enforceRouteRateLimit(
  routeName: string,
  identity: string,
  policy: RateLimitPolicyName | RateLimitPolicy
): Promise<NextResponse | null> {
  const p: RateLimitPolicy = typeof policy === 'string' ? RATE_LIMIT_POLICIES[policy] : policy;
  let result: Awaited<ReturnType<typeof checkRateLimitDb>> | null = null;
  try {
    result = await checkRateLimitDb(`route:${routeName}:u:${identity}`, p.max, p.windowMs);
  } catch (err) {
    console.warn('[route-rate-limit] oran sınırı kontrolü başarısız:', routeName, err);
    return null;
  }
  if (!result || result.ok) return null;
  const retryAfterSec = Math.max(1, Math.ceil((result.retryAfterMs ?? p.windowMs) / 1000));
  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: 'RATE_LIMITED',
      error: 'Çok fazla istek gönderdiniz. Lütfen biraz sonra tekrar deneyin.',
      message: 'Çok fazla istek gönderdiniz. Lütfen biraz sonra tekrar deneyin.',
      retryable: true,
    },
    { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(retryAfterSec) } }
  );
}
