/**
 * next-pwa (5.6) seçenekleri. CommonJS: next.config.js require eder; jest testleri
 * (__tests__/config/pwa-options.test.ts) doğrudan okur.
 *
 * P0-37 kök neden: `publicExcludes`/`buildExcludes` tanımlı değildi → next-pwa `public/`
 * klasörünün TAMAMINI (avatar/rozet/video ≈ 358 MB, 259 dosya) ve 954 JS chunk'ını
 * precache manifest'ine koyuyordu. Workbox'ın 2 MB dosya sınırı `additionalManifestEntries`
 * için uygulanmaz; SW kurulumu her ziyaretçide yüzlerce MB indirmeye kalkıyordu.
 *
 * Çözüm:
 *  - public/ altından yalnız küçük kabuk varlıkları (favicon, manifest, ikonlar) precache'e girer.
 *  - Webpack çıktısından yalnız uygulama kabuğu (webpack runtime, main-app, framework,
 *    polyfills, CSS, fontlar, build manifest) precache'e girer; rota chunk'ları kullanıldıkça
 *    `next-static` CacheFirst önbelleğine alınır (hash'li → güvenli).
 *  - `register: false`: SW YALNIZ oturum açmış müşteri/bayi panellerinde kaydedilir
 *    (components/pwa/service-worker-registrar.tsx). QR hunisi (/feedback, /c, /surveys,
 *    /table-signal) hiçbir zaman SW kaydetmez.
 *  - Push dinleyicisi aynı SW'ye `importScripts('/push-sw.js')` ile katılır; böylece
 *    `/` kapsamında iki SW'nin birbirinin yerine geçmesi (O9) biter.
 */

/** public/ precache dışı bırakılanlar (globby desenleri, `!` ile). */
const PUBLIC_EXCLUDES = [
  '!noprecache/**/*', // next-pwa varsayılanı — üzerine yazdığımız için korunur
  '!images/**/*',
  '!videos/**/*',
  '!mascot/**/*',
  '!logo/**/*',
  '!uploads/**/*',
  '!**/*.map',
  '!push-sw.js', // importScripts ile yüklenir; precache'e gerek yok
];

/**
 * Precache'e girecek webpack varlıkları. Bunun DIŞINDAKİ her `static/` varlığı
 * hariç tutulur (rota chunk'ları çalışma anında önbelleğe alınır).
 */
const SHELL_ASSET_PATTERNS = [
  /^static\/chunks\/(webpack|main-app|framework|polyfills)-[^/]+\.js$/,
  /^static\/css\/[^/]+\.css$/,
  /^static\/media\/[^/]+\.(woff2?|ttf|otf)$/,
  /^static\/[^/]+\/_(buildManifest|ssgManifest)\.js$/,
];

/**
 * Workbox `exclude` yüklemi: true → precache'e GİRMEZ.
 * @param {string} assetName webpack varlık adı (ör. `static/chunks/app/admin/page-abc.js`)
 */
function isExcludedFromPrecache(assetName) {
  if (assetName.endsWith('.map')) return true;
  if (!assetName.startsWith('static/')) return false; // next-pwa kendi filtresini ayrıca uygular
  return !SHELL_ASSET_PATTERNS.some((re) => re.test(assetName));
}

const BUILD_EXCLUDES = [({ asset }) => isExcludedFromPrecache(asset.name)];

/**
 * Çalışma anı önbellek kuralları. DİKKAT: `urlPattern` fonksiyonları `toString()` ile
 * sw.js'e gömülür — dış değişkene/kapanıma referans VERMEMELİ, kendi içinde bütün olmalı.
 * Workbox ilk eşleşen kuralı uygular; sıra önemlidir.
 */
const RUNTIME_CACHING = [
  {
    // Hash'li Next derleme çıktısı: içerik değişirse URL değişir → CacheFirst güvenli.
    urlPattern: /\/_next\/static\/.+\.(?:js|css|woff2?)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'next-static',
      expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'google-fonts-webfonts',
      expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'google-fonts-stylesheets',
      expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'static-font-assets',
      expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
    },
  },
  {
    // Hash'li optimize avatarlar ve rozet küçük resimleri (scripts/optimize-images.mjs) — değişmez.
    urlPattern: /\/images\/(?:avatar|badges)\/opt\/.+\.webp$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'avatar-images',
      expiration: { maxEntries: 200, maxAgeSeconds: 365 * 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'static-image-assets',
      expiration: { maxEntries: 128, maxAgeSeconds: 7 * 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\/_next\/image\?url=.+$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'next-image',
      expiration: { maxEntries: 128, maxAgeSeconds: 7 * 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:mp3|wav|ogg)$/i,
    handler: 'CacheFirst',
    options: {
      rangeRequests: true,
      cacheName: 'static-audio-assets',
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:mp4|webm)$/i,
    handler: 'CacheFirst',
    options: {
      rangeRequests: true,
      cacheName: 'static-video-assets',
      expiration: { maxEntries: 8, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:js)$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'static-js-assets',
      expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:css|less)$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'static-style-assets',
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'next-data',
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:json|xml|csv)$/i,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'static-data-assets',
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
  {
    // Aynı origin sayfaları: ağ öncelikli, çevrimdışıyken son kopya / /offline yedeği.
    // API, kimlik doğrulama ve yönetim yüzeyleri ASLA önbelleğe alınmaz (paylaşılan
    // cihazda oturum verisi Cache Storage'da kalmasın).
    urlPattern: ({ url }) => {
      if (self.origin !== url.origin) return false;
      const p = url.pathname;
      if (p.startsWith('/api/')) return false;
      if (p === '/admin' || p.startsWith('/admin/') || p.startsWith('/admin-gate')) return false;
      if (p.startsWith('/auth/')) return false;
      return true;
    },
    handler: 'NetworkFirst',
    options: {
      cacheName: 'others',
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      networkTimeoutSeconds: 10,
    },
  },
  {
    urlPattern: ({ url }) => self.origin !== url.origin,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'cross-origin',
      expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 },
      networkTimeoutSeconds: 10,
    },
  },
];

/** @param {{ isDev: boolean }} env */
function buildPwaOptions({ isDev }) {
  return {
    dest: 'public',
    register: false,
    skipWaiting: true,
    disable: isDev,
    // Push dinleyicisi tek SW'de (public/push-sw.js).
    importScripts: ['/push-sw.js'],
    publicExcludes: PUBLIC_EXCLUDES,
    buildExcludes: BUILD_EXCLUDES,
    // Ağ yokken ve istenen sayfa cache'te değilken gösterilecek yedek (app/offline).
    fallbacks: { document: '/offline' },
    runtimeCaching: RUNTIME_CACHING,
  };
}

module.exports = {
  PUBLIC_EXCLUDES,
  SHELL_ASSET_PATTERNS,
  BUILD_EXCLUDES,
  RUNTIME_CACHING,
  isExcludedFromPrecache,
  buildPwaOptions,
};
