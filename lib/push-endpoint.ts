/**
 * Web Push abonelik uç noktası doğrulaması (müşteri API denetimi — yeni bulgu: push SSRF).
 *
 * Kök neden: abonelik kaydı yalnız uzunluk kontrol ediyordu; oturumlu herhangi bir kullanıcı
 * `endpoint` olarak `http://10.0.0.5/…` ya da üçüncü taraf bir adres kaydedebiliyor, bildirim
 * gönderildiğinde sunucu (web-push) o adrese imzalı POST atıyordu (kör SSRF + dış istek
 * çoğaltma). Tarayıcıların ürettiği abonelikler yalnız bilinen push servislerine işaret eder;
 * başka her adres reddedilir (kayıtta 400, gönderimde atlanır).
 */

/** Tarayıcı push servisleri (alan adı kendisi ya da alt alan adı eşleşir). */
const PUSH_SERVICE_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Opera, Samsung
  'android.googleapis.com', // eski GCM
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge (WNS)
  'push.apple.com', // Safari (web.push.apple.com)
] as const;

export const MAX_PUSH_ENDPOINT_LENGTH = 2048;

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
