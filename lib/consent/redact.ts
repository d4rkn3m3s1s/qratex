/**
 * Analitik/oturum kaydına giden URL ve olaylardan gizli değerlerin ayıklanması (P0-31).
 *
 * Sorun: PostHog `$current_url` alanı şifre sıfırlama (`?token=`), magic link ve OAuth
 * (`?code=`, `?state=`) parametreleriyle gidiyordu → 60 dakika geçerli giriş token'ı üçüncü
 * tarafta. Bu modül PostHog `before_send` kancasında ve kendi pageview'ımızda kullanılır.
 */

export const REDACTED = '[gizli]';

/** Değeri her zaman gizlenen sorgu parametreleri (küçük harf karşılaştırılır). */
const SENSITIVE_PARAMS = new Set([
  'token',
  'code',
  'state',
  'otp',
  'sig',
  'signature',
  'password',
  'pass',
  'secret',
  'key',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'id_token',
  'session',
  'email',
  'phone',
  'ref',
]);

/** Adında bu parçalar geçen parametreler de gizlenir (ör. `resetToken`, `client_secret`). */
const SENSITIVE_PARAM_FRAGMENT = /token|secret|password|otp|signature|auth/i;

/** Yol içinde gizli kimlik taşıyan rotalar → şablon adıyla değiştirilir. */
const SENSITIVE_PATHS: ReadonlyArray<[RegExp, string]> = [
  [/^\/c\/[^/?#]+/i, '/c/[token]'],
  [/^\/experience\/[^/?#]+/i, '/experience/[token]'],
  [/^\/auth\/reset-password\/[^/?#]+/i, '/auth/reset-password/[token]'],
  [/^\/auth\/verify(?:-email)?\/[^/?#]+/i, '/auth/verify/[token]'],
  [/^\/api\/track\/email-open\/[^/?#]+/i, '/api/track/email-open/[token]'],
];

/** Oturum kaydının HİÇ açılmayacağı yollar (giriş, kapı, kart/paylaşım token'ları). */
const NO_REPLAY_PREFIXES = ['/auth', '/admin-gate', '/c', '/experience', '/api'];

function isSensitiveParam(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_PARAMS.has(lower) || SENSITIVE_PARAM_FRAGMENT.test(lower);
}

function redactPathname(pathname: string): string {
  for (const [re, replacement] of SENSITIVE_PATHS) {
    if (re.test(pathname)) return pathname.replace(re, replacement);
  }
  return pathname;
}

/**
 * URL'deki gizli parametre değerlerini ve token taşıyan yol parçalarını gizler. Mutlak URL
 * mutlak, göreli yol göreli kalır. Hash parçası (OAuth implicit akış token'ı taşıyabilir)
 * tamamen atılır. Çözülemeyen girdi olduğu gibi değil, `REDACTED` olarak döner.
 */
export function redactUrl(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') return REDACTED;
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  let url: URL;
  try {
    url = isAbsolute ? new URL(raw) : new URL(raw, 'https://redact.invalid');
  } catch {
    return REDACTED;
  }
  if (url.username || url.password) {
    url.username = '';
    url.password = '';
  }
  url.pathname = redactPathname(url.pathname);
  const params = url.searchParams;
  const names = Array.from(new Set(Array.from(params.keys())));
  for (const name of names) {
    if (isSensitiveParam(name)) params.set(name, REDACTED);
  }
  url.hash = '';
  // URLSearchParams köşeli parantezi kodlar; okunabilirlik için geri çevir.
  const search = url.search.replace(/%5Bgizli%5D/g, REDACTED);
  const path = url.pathname.replace(/%5Btoken%5D/gi, '[token]');
  return isAbsolute ? `${url.origin}${path}${search}` : `${path}${search}`;
}

/** Bu yolda oturum kaydı (session replay) çalışabilir mi? */
export function isReplayAllowedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const lower = pathname.toLowerCase();
  return !NO_REPLAY_PREFIXES.some((p) => lower === p || lower.startsWith(`${p}/`));
}

/** PostHog olay özelliklerinde URL taşıyan bilinen alanlar. */
const URL_PROPERTIES = [
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$pathname',
  '$initial_pathname',
  '$session_entry_url',
  '$session_entry_referrer',
  '$prev_pageview_pathname',
  'url',
  'href',
];

/** Gizli değer gibi görünen ama URL olmayan özellik adları — değeri tamamen gizlenir. */
const SECRET_PROPERTY = /token|secret|password|otp|signature/i;

type PlainProps = Record<string, unknown>;

/**
 * PostHog `before_send` için: olayın URL alanlarını ve gizli görünen özelliklerini ayıklar.
 * Olay nesnesini kopyalayarak döndürür (girdiyi değiştirmez). `null` olay `null` kalır.
 */
export function redactAnalyticsEvent<T extends { properties?: PlainProps | null; $set?: PlainProps | null }>(
  event: T | null
): T | null {
  if (!event) return event;
  const redactProps = (props: PlainProps | null | undefined): PlainProps | null | undefined => {
    if (!props || typeof props !== 'object') return props;
    const out: PlainProps = { ...props };
    for (const key of URL_PROPERTIES) {
      const v = out[key];
      if (typeof v === 'string' && v) out[key] = redactUrl(v);
    }
    for (const key of Object.keys(out)) {
      if (URL_PROPERTIES.includes(key)) continue;
      if (SECRET_PROPERTY.test(key) && typeof out[key] === 'string') out[key] = REDACTED;
    }
    return out;
  };
  return {
    ...event,
    ...(event.properties !== undefined ? { properties: redactProps(event.properties) } : {}),
    ...(event.$set !== undefined ? { $set: redactProps(event.$set) } : {}),
  };
}
