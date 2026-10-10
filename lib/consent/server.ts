/**
 * Sunucu tarafı rıza okuyucusu (çerezden). Server component, route handler ve proxy'de
 * isteğe bağlı işleme (ör. sunucudan PostHog olayı, pazarlama atfı) öncesi kontrol için.
 *
 * FAIL-SAFE: istek bağlamı yoksa (build-time statik üretim) veya çerez okunamazsa
 * "karar verilmemiş" (yalnız `necessary`) döner — hata fırlatmaz.
 */
import {
  CONSENT_COOKIE,
  effectiveConsent,
  hasConsent,
  parseConsent,
  readConsentCookieValue,
  type ConsentCategory,
  type EffectiveConsent,
} from './types';

type CookieReader = { get(name: string): { value: string } | undefined };
type RequestLike = { cookies?: CookieReader; headers?: { get(name: string): string | null } };

/** `Cookie` başlığından etkin rıza. */
export function readConsentFromCookieHeader(cookieHeader: string | null | undefined): EffectiveConsent {
  return effectiveConsent(parseConsent(readConsentCookieValue(cookieHeader)));
}

/** `NextRequest` (proxy / route handler) üzerinden etkin rıza. */
export function readConsentFromRequest(request: RequestLike | null | undefined): EffectiveConsent {
  try {
    const fromJar = request?.cookies?.get(CONSENT_COOKIE)?.value;
    if (fromJar) return effectiveConsent(parseConsent(fromJar));
    return readConsentFromCookieHeader(request?.headers?.get('cookie'));
  } catch {
    return effectiveConsent(null);
  }
}

/** Server component / route handler: `next/headers` çerezlerinden etkin rıza. */
export async function getServerConsent(): Promise<EffectiveConsent> {
  try {
    const { cookies } = await import('next/headers');
    const jar = await cookies();
    return effectiveConsent(parseConsent(jar.get(CONSENT_COOKIE)?.value));
  } catch {
    return effectiveConsent(null);
  }
}

/** Kısayol: bu istekte kategoriye izin var mı? */
export async function serverHasConsent(category: ConsentCategory): Promise<boolean> {
  const consent = await getServerConsent();
  return hasConsent(consent.state, category);
}
