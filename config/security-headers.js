/**
 * next.config.js `headers()` kaynağı — güvenlik başlıkları + statik varlık önbellek politikası.
 * CommonJS: next.config.js tarafından require edilir; jest testleri de doğrudan okur
 * (__tests__/config/security-headers.test.ts).
 */

/**
 * Permissions-Policy.
 *
 * `camera=(self)` neden SAYFA BAZLI değil de global?
 * App Router tek kök layout'a (app/layout.tsx) sahip; /dealer → /dealer/scan veya bir
 * herkese açık sayfadan /customer/scan'a geçiş YUMUŞAK (client-side) navigasyondur ve
 * belge değişmez. Permissions-Policy belgeye bağlıdır: ilk yüklenen sayfa `camera=()`
 * taşıyorsa tarama sayfasına yumuşak geçişte kamera yine engellenir (P0-36'nın kök nedeni
 * buydu: üretimde tarama hiç açılmıyordu). Bu yüzden kamera, yalnız KENDİ origin'imize
 * (`self`) tüm belgelerde açılır; üçüncü taraf iframe'ler yine engellidir ve tarayıcı izin
 * istemi kullanıcıyı korur. Kamerayı yalnız lib/hooks/use-qr-scanner.ts ister.
 */
const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=()',
  'geolocation=(self)',
  'payment=()',
  'usb=()',
].join(', ');

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // blob: + jsdelivr → Tesseract.js OCR worker/wasm (tarayıcı tarafı).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co https://*.netlify.app https://vitals.vercel-insights.com https://va.vercel-scripts.com https://*.ingest.sentry.io https://vercel.live https://cdn.jsdelivr.net https://tile.openstreetmap.org",
  "frame-src 'self' https://vercel.live",
  "frame-ancestors 'none'",
  // base-uri: <base> ile script kaçırma/relative-URL hijack önlemi.
  "base-uri 'self'",
  // form-action: form gönderimini yalnızca kendi origin'e sınırla.
  "form-action 'self'",
  // object-src: eklenti/Flash vektörlerini kapat.
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // HSTS: HTTPS'i zorla (downgrade/SSL-strip önlemi). 2 yıl + preload.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Cross-origin izolasyon: kaynakların başka origin'lerce gömülmesini sınırla.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
];

/** İçerik hash'li dosyalar: adı içerik değişince değişir → 1 yıl + immutable güvenli. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/**
 * Hash'siz statik varlıklar (aynı adla değiştirilebilir): 1 gün taze, 30 gün boyunca
 * arka planda yeniden doğrulanarak bayat sunulabilir. Önceki varsayılan
 * `max-age=0, must-revalidate` her kullanımda bir doğrulama turu demekti.
 */
const STATIC_ASSET_CACHE = 'public, max-age=86400, stale-while-revalidate=2592000';
/** Service worker betikleri her zaman ağdan doğrulanmalı (güncelleme gecikmesin). */
const SERVICE_WORKER_CACHE = 'public, max-age=0, must-revalidate';

const STATIC_ASSET_SOURCES = [
  '/images/:path*',
  '/icons/:path*',
  '/logo/:path*',
  '/mascot/:path*',
  '/videos/:path*',
];

/** SW betikleri (next-pwa çıktısı + importScripts ile içe alınan push dinleyicisi). */
const SERVICE_WORKER_SOURCES = ['/sw.js', '/push-sw.js'];

/** Script üretimi hash'li çıktılar (scripts/optimize-images.mjs). */
const IMMUTABLE_SOURCES = ['/images/avatar/opt/:path*'];

/**
 * Next.js `headers()` dizisi. Aynı başlık anahtarı birden fazla kurala uyarsa SONRAKİ
 * kural kazanır; bu yüzden genel kurallar önce, daha özel olanlar sonra gelir.
 */
function buildHeaders() {
  return [
    { source: '/:path*', headers: SECURITY_HEADERS },
    ...STATIC_ASSET_SOURCES.map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: STATIC_ASSET_CACHE }],
    })),
    ...IMMUTABLE_SOURCES.map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: IMMUTABLE_CACHE }],
    })),
    ...SERVICE_WORKER_SOURCES.map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: SERVICE_WORKER_CACHE }],
    })),
  ];
}

module.exports = {
  PERMISSIONS_POLICY,
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  IMMUTABLE_CACHE,
  STATIC_ASSET_CACHE,
  SERVICE_WORKER_CACHE,
  buildHeaders,
};
