import { sanitizeCallbackPath } from '@/lib/auth/post-login-target';

/**
 * Açık yönlendirme süzgeci (geriye uyumlu imza).
 *
 * Eski sürüm yalnız `startsWith('/') && !startsWith('//')` kontrol ediyordu: `/\evil.com`,
 * `/\t/evil.com` ve `/%5Cevil.com` tarayıcıda `//evil.com` olarak çözülüp resmi şifre
 * sıfırlama / magic link e-postalarını oltalama aracına çeviriyordu (P0-02). Artık TEK
 * KAYNAK `lib/auth/post-login-target.ts#sanitizeCallbackPath` kullanılır: girdi
 * `new URL(raw, origin)` ile çözülür, köken karşılaştırılır; ters bölü, kontrol karakteri,
 * `javascript:` gibi http(s) dışı şemalar ve protokol-göreli yollar reddedilir.
 *
 * Dönüş: güvenliyse aynı kökenli YOL (`/a?b#c`), değilse `undefined`.
 */
export function safePostLoginRedirect(raw: string | null | undefined, allowedOrigin: string): string | undefined {
  return sanitizeCallbackPath(raw, allowedOrigin) ?? undefined;
}
