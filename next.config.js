const { withSentryConfig } = require('@sentry/nextjs');

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-webfonts',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'google-fonts-stylesheets',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-font-assets',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-image-assets',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\/_next\/image\?url=.+$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-image',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:mp3|wav|ogg)$/i,
      handler: 'CacheFirst',
      options: {
        rangeRequests: true,
        cacheName: 'static-audio-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:mp4)$/i,
      handler: 'CacheFirst',
      options: {
        rangeRequests: true,
        cacheName: 'static-video-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:js)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-js-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:css|less)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-style-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-data',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:json|xml|csv)$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'static-data-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: ({ url }) => {
        const isSameOrigin = self.origin === url.origin;
        if (!isSameOrigin) return false;
        const pathname = url.pathname;
        if (pathname.startsWith('/api/')) return false;
        return true;
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'others',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: ({ url }) => {
        const isSameOrigin = self.origin === url.origin;
        return !isSameOrigin;
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'cross-origin',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 60 * 60,
        },
        networkTimeoutSeconds: 10,
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel: `public/` içeriği statik olarak servis edilir; output file tracing bunu her lambda’ya
  // kopyalayınca 250MB+ uyarısı oluşuyordu. public’a sadece URL üzerinden erişilir (fs okuma yok).
  outputFileTracingExcludes: {
    '*': [
      './public/**/*',
      './playwright-report/**/*',
      './test-results/**/*',
      './coverage/**/*',
      './.jest-cache/**/*',
      // Dev / test tooling — must not ship inside serverless traces (Vercel 250MB unzipped cap).
      './node_modules/playwright/**/*',
      './node_modules/playwright-core/**/*',
      './node_modules/@playwright/**/*',
      './node_modules/jest/**/*',
      './node_modules/@jest/**/*',
      './node_modules/eslint/**/*',
      './node_modules/@eslint/**/*',
      './node_modules/typescript/**/*',
      './node_modules/prisma/**/*',
      './node_modules/@next/bundle-analyzer/**/*',
      './node_modules/webpack/**/*',
      './node_modules/ts-node/**/*',
      // Next SWC: keep only linux x64 on Vercel; drop other platform binaries if present in the install tree.
      './node_modules/@next/swc-win32-x64-msvc/**/*',
      './node_modules/@next/swc-win32-arm64-msvc/**/*',
      './node_modules/@next/swc-darwin-x64/**/*',
      './node_modules/@next/swc-darwin-arm64/**/*',
      './node_modules/@next/swc-linux-arm64-gnu/**/*',
      './node_modules/@next/swc-linux-arm64-musl/**/*',
      // Prisma: custom output — drop engines for non-Linux deploy targets (Vercel = glibc linux / rhel).
      './generated-prisma-client/**/*darwin*',
      './generated-prisma-client/**/*windows*',
      './generated-prisma-client/**/*musl*',
      // sharp / @img: Vercel linux-x64 dışındaki önceden derlenmiş ikilileri trace’ten çıkar
      './node_modules/@img/sharp-darwin*/**/*',
      './node_modules/@img/sharp-win32*/**/*',
      './node_modules/@img/sharp-wasm32*/**/*',
      './node_modules/@img/sharp-linuxmusl*/**/*',
      './node_modules/@img/sharp-libvips-darwin*/**/*',
      './node_modules/@img/sharp-libvips-win32*/**/*',
      './node_modules/@img/sharp-libvips-linuxmusl*/**/*',
    ],
  },
  // Ağır native modüllerin server bundle’a yanlışlıkla tam çekilmesini azaltır (Vercel lambda boyutu).
  serverExternalPackages: ['@prisma/client', 'prisma', 'sharp'],
  // Görsel optimizasyonu: Vercel/Netlify ile uyumlu; custom server kullanıyorsanız unoptimized: true gerekebilir.
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: 'https', hostname: 'localhost' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'qratex.netlify.app' },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.netlify.app',
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'qratex.netlify.app',
        ...(process.env.VERCEL_URL ? [process.env.VERCEL_URL] : []),
      ],
    },
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@opentelemetry\/instrumentation/, message: /Critical dependency/ },
      { module: /require-in-the-middle/, message: /dependencies cannot be statically extracted/ },
    ];
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.vercel-insights.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co https://*.netlify.app https://vitals.vercel-insights.com https://*.ingest.sentry.io",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

// PWA: build sırasında _document hatası verebiliyor; varsayılan kapalı, production'da ENABLE_PWA=1 ile açılabilir
const usePWA = process.env.ENABLE_PWA === '1';
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

