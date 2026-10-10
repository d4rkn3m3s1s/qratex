/**
 * Giriş sonrası yönlendirme hedefi — TEK KAYNAK (P0-02).
 *
 * Eski `safePostLoginRedirect` yalnız `startsWith('/') && !startsWith('//')` kontrolü yapıyordu;
 * `/\evil.com` tarayıcıda `//evil.com` olarak çözülüp açık yönlendirmeye, giriş sayfasındaki
 * ham `window.location.href = callbackUrl` ise `javascript:` ile DOM XSS'e dönüşüyordu. Bu
 * modül her girdiyi `new URL(raw, origin)` ile ÇÖZÜP köken karşılaştırması yapar ve yalnız
 * aynı kökenli bir YOL (path + query + hash) döndürür — mutlak URL asla dönmez.
 *
 * Reddedilenler (rol varsayılanına düşer):
 *  - boş / 2048 karakterden uzun girdi
 *  - ters bölü (`\`) ve yüzde-kodlu hâli (`%5C`), kontrol karakterleri (`\t`, `\n`, `\0`...)
 *    ve bunların yüzde-kodlu hâlleri (`%09`, `%0A`, `%00`...)
 *  - `javascript:`, `data:`, `vbscript:`, `blob:`, `file:` vb. — http(s) dışı her şema
 *  - protokol-göreli `//evil.com` ve kodlu `/%2F%2Fevil.com`
 *  - başka kökenli mutlak URL'ler, kullanıcı adı/şifre içeren URL'ler (`https://a@evil.com`)
 *  - `/api/*` ve giriş/kayıt sayfaları (döngü ve CSRF benzeri tetikleme)
 *  - rol bilindiğinde başka rolün paneli (`/admin`, `/dealer`, `/customer`, `/staff`) —
 *    proxy zaten engeller; burada kullanıcıyı yönlendirme sıçramasından korur.
 */

export type PostLoginRole = 'ADMIN' | 'DEALER' | 'CUSTOMER' | 'STAFF';

/** Rol varsayılan iniş sayfaları (proxy.ts `roleRedirects` ile aynı). */
export const ROLE_HOME: Readonly<Record<PostLoginRole, string>> = Object.freeze({
  ADMIN: '/admin',
  DEALER: '/dealer',
  CUSTOMER: '/customer',
  STAFF: '/staff',
});

/** Panel önekleri → sahip rol (proxy.ts `roleRouteMap` ile aynı; düz `startsWith`). */
const ROLE_AREAS: ReadonlyArray<readonly [string, PostLoginRole]> = [
  ['/admin', 'ADMIN'],
  ['/dealer', 'DEALER'],
  ['/customer', 'CUSTOMER'],
  ['/staff', 'STAFF'],
];

/** Girişten sonra gidilmesi anlamsız/tehlikeli yollar. */
const BLOCKED_PATH_PREFIXES = ['/api/', '/auth/login', '/auth/register', '/auth/signout', '/_next/'];

const MAX_TARGET_LENGTH = 2048;
// C0/C1 kontrol karakterleri + satır/paragraf ayırıcı (U+2028/U+2029). Ayırıcılar kod noktasından
// üretilir: kaynakta çıplak hâlleri regex literalini satır sonu olarak böler.
const CONTROL_CHARS = new RegExp(
  `[\\u0000-\\u001F\\u007F-\\u009F${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`
);
/** Yüzde-kodlu ters bölü ve kontrol karakterleri (%00-%1F, %7F). */
const ENCODED_DANGEROUS = /%(?:5c|[01][0-9a-f]|7f)/i;
const SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):/i;
/** Geçerli bir köken verilmediğinde kullanılan, dışarıdan erişilemeyen taban. */
const FALLBACK_BASE = 'https://post-login.invalid';

export function roleHome(role: string | null | undefined): string {
  if (role && Object.prototype.hasOwnProperty.call(ROLE_HOME, role)) {
    return ROLE_HOME[role as PostLoginRole];
  }
  return '/';
}

function parseOrigin(origin: string | null | undefined): string | null {
  if (!origin || typeof origin !== 'string') return null;
  try {
    const u = new URL(origin.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Rolden bağımsız güvenlik süzgeci: güvenliyse aynı kökenli YOL döndürür, değilse null.
 * E-postaya gömülecek `callbackUrl` gibi rolün henüz bilinmediği yerlerde kullanılır.
 */
export function sanitizeCallbackPath(
  raw: string | null | undefined,
  origin: string | null | undefined,
  options: { allowNonLandingPaths?: boolean } = {}
): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > MAX_TARGET_LENGTH) return null;

  // Ham ve bir kez çözülmüş hâlde tehlikeli karakter avı (çift kodlamaya karşı ikisi birden).
  if (s.includes('\\') || CONTROL_CHARS.test(s) || ENCODED_DANGEROUS.test(s)) return null;
  const decoded = safeDecode(s);
  if (decoded === null) return null;
  if (decoded.includes('\\') || CONTROL_CHARS.test(decoded)) return null;
  if (s.startsWith('//') || decoded.startsWith('//')) return null;

  const scheme = SCHEME_PREFIX.exec(s)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') return null;
  // Şema yoksa yalnız kökten başlayan yol kabul edilir (`evil.com/x`, `../x`, `?x` reddedilir).
  if (!scheme && !s.startsWith('/')) return null;

  const allowedOrigin = parseOrigin(origin);
  // Köken bilinmiyorsa mutlak URL hiçbir zaman kabul edilmez.
  if (scheme && !allowedOrigin) return null;
  const base = allowedOrigin ?? FALLBACK_BASE;

  let url: URL;
  try {
    url = new URL(s, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin !== new URL(base).origin) return null;
  if (url.username || url.password) return null;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path.startsWith('/') || path.startsWith('//') || path.length > MAX_TARGET_LENGTH) return null;
  const lowerPath = url.pathname.toLowerCase();
  if (options.allowNonLandingPaths) return path;
  if (BLOCKED_PATH_PREFIXES.some((p) => lowerPath === p.replace(/\/$/, '') || lowerPath.startsWith(p))) {
    return null;
  }
  return path;
}

function areaOwner(pathname: string): PostLoginRole | null {
  for (const [prefix, owner] of ROLE_AREAS) {
    if (pathname.startsWith(prefix)) return owner;
  }
  return null;
}

/**
 * Giriş sonrası gidilecek yolu çözer — HER ZAMAN güvenli, aynı kökenli bir yol döndürür.
 *
 * @param raw     `callbackUrl` / `next` / `from` gibi güvenilmeyen girdi
 * @param role    Oturumdaki rol; bilinmiyorsa (null) panel uyumluluğu kontrolü atlanır
 * @param origin  Uygulamanın kökeni (`window.location.origin` veya `getPublicAppOrigin()`)
 */
export function resolvePostLoginTarget(
  raw: string | null | undefined,
  role: string | null | undefined,
  origin: string | null | undefined
): string {
  const fallback = roleHome(role);
  const path = sanitizeCallbackPath(raw, origin);
  if (!path || path === '/') return fallback;
  if (role) {
    const owner = areaOwner(path.split(/[?#]/, 1)[0] ?? path);
    if (owner && owner !== role) return fallback;
  }
  return path;
}

/**
 * NextAuth `callbacks.redirect` uyarlayıcısı. NextAuth mutlak URL bekler; güvenli yol
 * `baseUrl` ile birleştirilir, aksi hâlde `baseUrl` döner.
 *
 *   callbacks: { redirect: ({ url, baseUrl }) => nextAuthRedirect({ url, baseUrl }) }
 */
export function nextAuthRedirect({ url, baseUrl }: { url: string; baseUrl: string }): string {
  const base = parseOrigin(baseUrl);
  if (!base) return baseUrl;
  // signOut → '/auth/login' gibi meşru NextAuth hedefleri engellenmesin: yalnız güvenlik süzgeci.
  const path = sanitizeCallbackPath(url, base, { allowNonLandingPaths: true });
  return path ? `${base}${path}` : base;
}
