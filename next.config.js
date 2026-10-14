const { withSentryConfig } = require('@sentry/nextjs');

const { buildPwaOptions } = require('./config/pwa');
const { buildHeaders } = require('./config/security-headers');
// Eski → yeni rota eşlemesi tek navigasyon kaydından türetilir (lib/navigation/registry.ts).
const { buildNavRedirects } = require('./lib/navigation/next-redirects');

// PWA seçenekleri (precache kapsamı, çalışma anı önbellekleri, push entegrasyonu) ve
// gerekçeleri config/pwa.js içinde; testler: __tests__/config/pwa-options.test.ts
const withPWA = require('next-pwa')(
  buildPwaOptions({ isDev: process.env.NODE_ENV === 'development' }),
);

/**
 * Sunucusuz trace’ten çıkarılacak yollar (Vercel 250MB unzipped).
 * Hem `./` hem kök-relative: NFT / Turbopack / Linux cwd farkları için çoğaltılır.
 */
const OUTPUT_FILE_TRACING_EXCLUDE_GLOBS = [
  'public/**/*',
  'playwright-report/**/*',
  'test-results/**/*',
  'coverage/**/*',
  '.jest-cache/**/*',
  'scripts/**/*',
  'docs/**/*',
  '__tests__/**/*',
  '.git/**/*',
  'node_modules/.cache/**/*',
  // Dev / test
  'node_modules/playwright/**/*',
  'node_modules/playwright-core/**/*',
  'node_modules/@playwright/**/*',
  'node_modules/jest/**/*',
  'node_modules/@jest/**/*',
  'node_modules/eslint/**/*',
  'node_modules/@eslint/**/*',
  'node_modules/typescript/**/*',
  'node_modules/prisma/**/*',
  'node_modules/@next/bundle-analyzer/**/*',
  'node_modules/webpack/**/*',
  'node_modules/ts-node/**/*',
  'node_modules/@gltf-transform/**/*',
  // esbuild: yalnızca linux-x64 kalır (Vercel)
  'node_modules/@esbuild/darwin-arm64/**/*',
  'node_modules/@esbuild/darwin-x64/**/*',
  'node_modules/@esbuild/win32-arm64/**/*',
  'node_modules/@esbuild/win32-ia32/**/*',
  'node_modules/@esbuild/win32-x64/**/*',
  'node_modules/@esbuild/linux-arm/**/*',
  'node_modules/@esbuild/linux-arm64/**/*',
  'node_modules/@esbuild/linux-ia32/**/*',
  'node_modules/@esbuild/linux-loong64/**/*',
  'node_modules/@esbuild/linux-mips64el/**/*',
  'node_modules/@esbuild/linux-ppc64/**/*',
  'node_modules/@esbuild/linux-riscv64/**/*',
  'node_modules/@esbuild/linux-s390x/**/*',
  'node_modules/@esbuild/aix-ppc64/**/*',
  'node_modules/@esbuild/android-arm/**/*',
  'node_modules/@esbuild/android-arm64/**/*',
  'node_modules/@esbuild/android-x64/**/*',
  'node_modules/@esbuild/freebsd-arm64/**/*',
  'node_modules/@esbuild/freebsd-x64/**/*',
  'node_modules/@esbuild/netbsd-x64/**/*',
  'node_modules/@esbuild/openbsd-arm64/**/*',
  'node_modules/@esbuild/openbsd-x64/**/*',
  'node_modules/@esbuild/sunos-x64/**/*',
  // Next SWC: linux x64 gnu dışı
  'node_modules/@next/swc-win32-x64-msvc/**/*',
  'node_modules/@next/swc-win32-arm64-msvc/**/*',
  'node_modules/@next/swc-darwin-x64/**/*',
  'node_modules/@next/swc-darwin-arm64/**/*',
  'node_modules/@next/swc-linux-arm64-gnu/**/*',
  'node_modules/@next/swc-linux-arm64-musl/**/*',
  'node_modules/@next/swc-linux-x64-musl/**/*',
  // Prisma özel çıktı — Linux dışı motorlar
  'generated-prisma-client/**/*darwin*',
  'generated-prisma-client/**/*windows*',
  'generated-prisma-client/**/*musl*',
  // sharp / @img
  'node_modules/@img/sharp-darwin*/**/*',
  'node_modules/@img/sharp-win32*/**/*',
  'node_modules/@img/sharp-wasm32*/**/*',
  'node_modules/@img/sharp-linuxmusl*/**/*',
  'node_modules/@img/sharp-libvips-darwin*/**/*',
  'node_modules/@img/sharp-libvips-win32*/**/*',
  'node_modules/@img/sharp-libvips-linuxmusl*/**/*',
];

/** Yapılandırılmış tek bir dış adresin (ör. Supabase projesi) host'u; tanımsızsa hiçbiri. */
function envHostPattern(raw) {
  const v = (raw || '').trim();
  if (!v) return [];
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? [{ protocol: 'https', hostname: u.hostname }] : [];
  } catch {
    return [];
  }
}

function expandOutputFileTracingExcludes(globs) {
  const out = new Set();
  for (const g of globs) {
    out.add(g);
    if (!g.startsWith('./')) out.add(`./${g}`);
  }
  return [...out];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Kalite kapısı ölçümü (scripts/quality-gates.mjs) üretim derlemesini ayrı klasöre alır;
  // çalışan dev sunucusunun .next'i ezilmez. Ayarlanmamışsa Next varsayılanı (.next).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Vercel: `public/` içeriği statik olarak servis edilir; output file tracing bunu her lambda’ya
  // kopyalayınca 250MB+ uyarısı oluşuyordu. public’a sadece URL üzerinden erişilir (fs okuma yok).
  outputFileTracingExcludes: {
    '*': expandOutputFileTracingExcludes(OUTPUT_FILE_TRACING_EXCLUDE_GLOBS),
  },
  // Ağır native modüllerin server bundle’a yanlışlıkla tam çekilmesini azaltır (Vercel lambda boyutu).
  serverExternalPackages: ['@prisma/client', 'prisma', 'sharp'],
  // Görsel optimizasyonu: Vercel/Netlify ile uyumlu; custom server kullanıyorsanız unoptimized: true gerekebilir.
  images: {
    unoptimized: false,
    remotePatterns: [
      // guvenlik-admin-api B15: yalnız fiilen kullanılan, sahibi belli alanlar. Eskiden
      // "**.netlify.app" / "**.supabase.co" (herkesin alt alan açabildiği barındırma alanları →
      // görsel optimizasyon kotası başkasının görselleriyle tüketilebilirdi) ve üretimde de
      // "localhost" (optimizasyon sunucusunun kendi makinesine istek) vardı.
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [
            { protocol: 'https', hostname: 'localhost' },
            { protocol: 'http', hostname: 'localhost' },
          ]),
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'qratex.netlify.app' },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      // R2 görselleri artık aynı kökenden (/api/files/public/...) sunulur; r2.dev deseni yok.
      ...envHostPattern(process.env.NEXT_PUBLIC_SUPABASE_URL),
    ],
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@tanstack/react-query',
      '@tanstack/react-table',
      'recharts',
      'framer-motion',
      'zod',
      'sonner',
    ],
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'qratex.netlify.app',
        ...(process.env.VERCEL_URL ? [process.env.VERCEL_URL] : []),
      ],
    },
  },
  turbopack: { root: __dirname },
  webpack: (config, { isServer }) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@opentelemetry\/instrumentation/, message: /Critical dependency/ },
      { module: /require-in-the-middle/, message: /dependencies cannot be statically extracted/ },
    ];
    return config;
  },
  // Güvenlik başlıkları + statik varlık önbellek politikası: config/security-headers.js
  // (kamera izni, immutable avatarlar, SW betikleri). Testler: __tests__/config/security-headers.test.ts
  async headers() {
    return buildHeaders();
  },
  // Emekli rotalar → birleştirildikleri yüzey (308, sorgu korunur). Yalnız hedef sayfa var
  // ve eski sayfa dosyası silinmişse etkinleşir; koçan varsa sekme/parametre eşlemesini koçan
  // yapar — bkz. lib/navigation/next-redirects.js.
  async redirects() {
    return buildNavRedirects(__dirname);
  },
};

// PWA: build sırasında _document hatası verebiliyor; varsayılan kapalı, production'da ENABLE_PWA=1 ile açılabilir
// PWA: Qratex 2.0 için varsayılan olarak açık
const usePWA = true; // process.env.ENABLE_PWA === '1';
const configWithPWA = usePWA ? withPWA(nextConfig) : nextConfig;

let configToExport = configWithPWA;
try {
  const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
  });
  configToExport = withBundleAnalyzer(configWithPWA);
} catch (_) {
  // @next/bundle-analyzer yüklü değilse atla
}

// P2-25: Sentry - must wrap last; optional org/project for source maps
// Geçici: MODULE_NOT_FOUND (4894.js) build hatası için Sentry devre dışı
const useSentry = process.env.DISABLE_SENTRY_BUILD !== '1';
module.exports = useSentry
  ? withSentryConfig(configToExport, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      hideSourceMaps: true,
    })
  : configToExport;

