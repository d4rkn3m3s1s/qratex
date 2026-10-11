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

/**
 * İçerik Güvenlik Politikası — TEK KAYNAK (guvenlik-admin-api B11). `proxy.ts` artık kendi
 * CSP'sini yazmaz; her yanıt (sayfa + /api) bu başlığı next.config `headers()` üzerinden alır.
 *
 * Dış kaynaklar (yalnız fiilen kullanılanlar):
 *  - Vercel Analytics/Speed Insights + Live (önizleme araç çubuğu)
 *  - jsdelivr → Tesseract.js OCR worker/wasm (tarayıcı tarafı)
 *  - PostHog (yalnız analitik rızasıyla yüklenir): eu.i.posthog.com + eklenti betikleri
 *  - Sentry (bölgesel alt alanlar dahil: o1.ingest.de.sentry.io → *.sentry.io)
 *  - OpenStreetMap karoları (Leaflet)
 * Eskiden connect-src'de kullanılmayan `*.supabase.co`/`*.netlify.app` (herkesin alt alan açabildiği
 * barındırma alanları → veri sızdırma kanalı) vardı, PostHog ise yoktu (rıza verilse bile engelleniyordu).
 */
const CSP_SCRIPT_HOSTS =
  'https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live https://cdn.jsdelivr.net https://*.posthog.com';

function buildCsp(scriptSrc) {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' blob: data: https://vitals.vercel-insights.com https://va.vercel-scripts.com https://*.sentry.io https://*.posthog.com https://vercel.live https://cdn.jsdelivr.net https://tile.openstreetmap.org",
    "frame-src 'self' https://vercel.live",
    "frame-ancestors 'none'",
    // base-uri: <base> ile script kaçırma/relative-URL hijack önlemi.
    "base-uri 'self'",
    // form-action: form gönderimini yalnızca kendi origin'e sınırla.
    "form-action 'self'",
    // object-src: eklenti/Flash vektörlerini kapat.
    "object-src 'none'",
  ].join('; ');
}

/**
 * Uygulanan politika. `'unsafe-inline'` Next.js App Router'ın satır içi önyükleme betikleri için
 * gerekli (nonce'lu CSP her sayfayı dinamik render'a zorlar — statik/ISR sayfalar kaybolur).
 */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * `'unsafe-eval'` YALNIZ geliştirmede (genel denetim 2026-10 guvenlik): next dev / React
 * geliştirme çağrı yığınları eval kullanır; üretim paketinde (`.next/static/chunks`) `eval(` /
 * `new Function(` YOK (grep ile doğrulandı) → üretimde yalnız WebAssembly için `'wasm-unsafe-eval'`.
 */
const SCRIPT_EVAL_SOURCE = IS_PRODUCTION ? "'wasm-unsafe-eval'" : "'unsafe-eval'";

const CONTENT_SECURITY_POLICY = buildCsp(
  `'self' 'unsafe-inline' ${SCRIPT_EVAL_SOURCE} blob: ${CSP_SCRIPT_HOSTS}`
);

/** CSP ihlal raporlarının gönderildiği uç (yalnız Report-Only politikası kullanır). */
const CSP_REPORT_PATH = '/api/security/csp-report';

/**
 * GÖZLEM politikası (Report-Only, ENGELLEMEZ): `'unsafe-eval'` olmadan — WebAssembly derlemesi
 * (Tesseract) için yalnız `'wasm-unsafe-eval'`. Üretimde bu politikayı ihlal eden betik kalmadığı
 * raporlarla doğrulanınca `'unsafe-eval'` uygulanan politikadan çıkarılır (B11 geçiş planı).
 */
const CONTENT_SECURITY_POLICY_REPORT_ONLY = `${buildCsp(
  `'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: ${CSP_SCRIPT_HOSTS}`
)}; report-uri ${CSP_REPORT_PATH}`;

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
  { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY_REPORT_ONLY },
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
const IMMUTABLE_SOURCES = ['/images/avatar/opt/:path*', '/images/badges/opt/:path*'];

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
  CONTENT_SECURITY_POLICY_REPORT_ONLY,
  CSP_REPORT_PATH,
  SECURITY_HEADERS,
  IMMUTABLE_CACHE,
  STATIC_ASSET_CACHE,
  SERVICE_WORKER_CACHE,
  buildHeaders,
};
