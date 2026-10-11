/**
 * Giriş hata kodları — sunucu (`authorize`, NextAuth `signIn` callback'i) ile istemci
 * (giriş, magic, hata sayfaları) arasındaki TEK sözleşme.
 *
 * Neden: `authorize` önceden sabit Türkçe cümleler fırlatıyordu, istemci de bunlara
 * bakmadan her hatada "e-posta veya şifre hatalı" gösteriyordu. Doğrulanmamış hesap,
 * kilitlenme ve oran sınırı kullanıcıya hiç anlatılmıyordu (destek talebi üreticisi).
 * Artık sunucu makine-okunur kod fırlatır (`LOCKED:900` gibi isteğe bağlı saniye ekiyle),
 * istemci bu modülle çözüp duruma özel arayüz gösterir.
 *
 * Bu dosya isomorfiktir (sunucu + tarayıcı); Node API'si kullanmaz.
 */

export const AUTH_ERROR = {
  /** E-posta/şifre eksik. */
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  /** Kullanıcı yok veya şifre yanlış (ikisi ayırt EDİLMEZ — kullanıcı sayımı önlemi). */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Şifre DOĞRU ama e-posta doğrulanmamış (yalnız doğru şifreden sonra döner). */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /** Çok fazla başarısız deneme → geçici kilit. `LOCKED:<saniye>` */
  LOCKED: 'LOCKED',
  /** Dakikalık deneme sınırı. `RATE_LIMITED:<saniye>` */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Şifre (veya bağlantı / OAuth) doğru; ikinci adım (TOTP/kurtarma kodu) gerekli. */
  TWO_FACTOR_REQUIRED: '2FA_REQUIRED',
  /** İkinci adım kodu hatalı. */
  INVALID_2FA: 'INVALID_2FA',
  /** Magic link / doğrulama bağlantısı geçersiz, kullanılmış veya süresi dolmuş. */
  INVALID_LINK: 'INVALID_LINK',
  /** Hesap askıya alınmış veya anonimleştirilmiş. */
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR)[keyof typeof AUTH_ERROR];

/**
 * NextAuth'un `/auth/error?error=` ve `/auth/login?error=` ile ilettiği kodlar + bizim
 * `signIn` callback'imizin ürettiği OAuth kodları.
 */
export const OAUTH_ERROR = {
  /** Google e-postayı doğrulanmış olarak bildirmedi → bağlama/oluşturma reddedildi. */
  EMAIL_UNVERIFIED: 'OAuthEmailUnverified',
  /** Sağlayıcı e-posta döndürmedi. */
  NO_EMAIL: 'OAuthNoEmail',
  /** Hesap askıda (OAuth yolunda). */
  ACCOUNT_SUSPENDED: 'AccountSuspended',
  /**
   * Yönetici yeni kayıtları kapattı; sağlayıcıyla İLK KEZ gelen kişiye hesap açılmaz.
   * Eskiden `AccessDenied` dönüyordu → ekranda "Giriş iptal edildi, tekrar deneyebilirsin"
   * yazıyordu (tekrar denemek hiçbir şey değiştirmez; yanıltıcı).
   */
  REGISTRATION_CLOSED: 'RegistrationClosed',
} as const;

export type AuthErrorKind =
  | AuthErrorCode
  | 'OAuthAccountNotLinked'
  | 'OAuthSignin'
  | 'OAuthCallback'
  | 'OAuthCreateAccount'
  | 'Callback'
  | 'AccessDenied'
  | 'Verification'
  | 'Configuration'
  | 'SessionRequired'
  | 'CredentialsSignin'
  | (typeof OAUTH_ERROR)[keyof typeof OAUTH_ERROR]
  | 'UNKNOWN';

const KNOWN_CODES = new Set<string>([
  ...Object.values(AUTH_ERROR),
  ...Object.values(OAUTH_ERROR),
  'OAuthAccountNotLinked',
  'OAuthSignin',
  'OAuthCallback',
  'OAuthCreateAccount',
  'Callback',
  'AccessDenied',
  'Verification',
  'Configuration',
  'SessionRequired',
  'CredentialsSignin',
]);

/** Sunucuda fırlatılacak hata metnini üretir: `LOCKED:900` veya `INVALID_2FA`. */
export function encodeAuthError(code: AuthErrorCode, retryAfterSec?: number): string {
  if (typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return `${code}:${Math.ceil(retryAfterSec)}`;
  }
  return code;
}

export type ParsedAuthError = { code: AuthErrorKind; retryAfterSec?: number };

/**
 * `signIn(..., { redirect: false })` sonucundaki `error` veya URL'deki `?error=` değerini çözer.
 * Bilinmeyen değer (eski sürümün Türkçe cümlesi dahil) `UNKNOWN` olur — ham metin ASLA
 * kullanıcıya basılmaz (iç ayrıntı sızmasın).
 */
export function parseAuthError(raw: string | null | undefined): ParsedAuthError | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const [head, tail] = s.split(':', 2) as [string, string | undefined];
  if (!KNOWN_CODES.has(head)) return { code: 'UNKNOWN' };
  const sec = tail !== undefined ? Number.parseInt(tail, 10) : NaN;
  return Number.isFinite(sec) && sec > 0
    ? { code: head as AuthErrorKind, retryAfterSec: sec }
    : { code: head as AuthErrorKind };
}

/** Bu hata durumunda kullanıcı bir süre beklemeli mi? */
export function isThrottleError(e: ParsedAuthError | null): boolean {
  return !!e && (e.code === AUTH_ERROR.LOCKED || e.code === AUTH_ERROR.RATE_LIMITED);
}
