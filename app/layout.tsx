import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import Script from 'next/script';
import { CookieConsentBanner } from '@/components/layout/cookie-consent-banner';
import './globals.css';
import '@/components/ui/profile-backgrounds.css';
import { Providers } from '@/components/providers';
import { DeferredRootIslands } from '@/components/deferred-root-islands';
import { Toaster } from '@/components/ui/toaster';
import { ChatbotLazy } from '@/components/chat/chatbot-lazy';
import { siteUrl } from '@/lib/site-config';
import { getSeoSettings } from '@/lib/seo-settings';
import { resolveSeoBaseUrl } from '@/lib/seo-url';
import { VIEWPORT_THEME_COLOR_DARK, VIEWPORT_THEME_COLOR_LIGHT } from '@/lib/brand-colors';
import { getPublicThemeSettings } from '@/lib/get-public-theme-settings';
import { RUNTIME_THEME_STYLE_ID, buildRuntimeThemeCss, runtimeThemeStateFromRows } from '@/lib/design-system/theme-runtime';
import { PageTransition } from '@/components/layout/page-transition';
import { NativeBridge } from '@/components/native/native-bridge';
import { LOCALE_LANG_INIT_SNIPPET } from '@/lib/locale-shared';

/** İlk boyamadan önce light/dark sınıfı (next-themes / localStorage ile uyumlu; FOUC azaltır). */
/** Platform varsayılan modu (Tasarım Sistemi → Temalar `defaultMode`); kullanıcının kayıtlı seçimi önce gelir. */
function readDefaultMode(rows: ReadonlyArray<{ key: string; value: unknown }>): 'system' | 'light' | 'dark' {
  const v = rows.find((r) => r.key === 'defaultMode')?.value;
  return v === 'light' || v === 'dark' ? v : 'system';
}

const themeClassInitScript = (defaultMode: 'system' | 'light' | 'dark') => `
(function(){
  try {
    var k = 'qratex-theme';
    var t = localStorage.getItem(k);
    var d = '${defaultMode}';
    var sys = function(){ return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; };
    var resolved = (t === 'light' || t === 'dark') ? t : (t === 'system' ? sys() : (d === 'light' || d === 'dark') ? d : sys());
    var el = document.documentElement;
    el.classList.add(resolved);
    el.setAttribute('data-theme', resolved);
    el.style.colorScheme = resolved;
  } catch (e) {}
  // Erişilebilirlik tercihleri (lib/accessibility-prefs.ts) ilk boyamadan önce: yazı boyutu
  // sıçraması ve kontrast/hareket flaşı olmasın (yol haritası §4.2 kural 1).
  try {
    var a = JSON.parse(localStorage.getItem('qratex-a11y') || 'null');
    if (a) {
      var c = document.documentElement.classList;
      if (a.highContrast) c.add('high-contrast');
      if (a.reduceAnimations) c.add('reduce-animations');
      if (a.colorblindMode) c.add('colorblind');
      if (a.textScale === 'lg' || a.textScale === 'xl') c.add('text-scale-' + a.textScale);
    }
  } catch (e) {}
  // Dil (B2): kök layout statik kalsın diye sunucu lang="tr" basar; çerezdeki dil ilk boyamadan önce.
  ${LOCALE_LANG_INIT_SNIPPET}
})();
`;

// Yazı tipleri (QDL tipografi): Inter = arayüz (`font-sans`), Space Grotesk = skor/sayaç
// başlıkları (`font-display`, play kaydı), JetBrains Mono = kod/kimlik/API yolu (`font-mono`).
// Eskiden `--font-mono` Space Grotesk'e (orantılı) bağlıydı → kodlar/ID'ler hizasızdı.
// `latin-ext`: Türkçe ğ ş İ Ş Ğ ilk boyamada ayrı istekle geç gelmesin.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

// Görüntü yazısı (skor/sayaç) hiçbir rotada ilk boyamanın metni değil; ön yükleme kritik yolda
// Inter ile bant genişliği yarıştırıyordu (/ LCP). swap: önce yedek yazı, sonra değişim.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  display: 'swap',
  preload: false,
});

// Yalnız kod/kimlik alanlarında kullanılır → ön yükleme yok (her sayfanın kritik yolunda değil).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings();
  // P0-39: boş/bozuk Site URL `new URL('')` ile bütün siteyi çökertiyordu;
  // taban her zaman ayrıştırılabilir (canonicalBase → siteUrl → ortam varsayılanı).
  const base = resolveSeoBaseUrl(seo, siteUrl);
  return {
    title: {
      default: seo.defaultTitle,
      template: `%s | ${seo.siteName}`,
    },
    description: seo.defaultDescription,
    keywords: seo.keywords,
    authors: [{ name: `${seo.siteName} Team` }],
    creator: seo.siteName,
    publisher: seo.siteName,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(base),
    alternates: {
      canonical: '/',
      languages: { 'tr': base, 'x-default': base },
    },
    openGraph: {
      type: 'website',
      locale: seo.locale.replace('_', '-'),
      url: base,
      siteName: seo.siteName,
      title: seo.defaultTitle,
      description: seo.defaultDescription,
      images: [
        {
          url: seo.ogImageUrl,
          width: seo.ogImageWidth,
          height: seo.ogImageHeight,
          alt: seo.siteName,
        },
      ],
    },
    twitter: {
      card: seo.twitterCard,
      title: seo.defaultTitle,
      description: seo.defaultDescription,
      images: [seo.ogImageUrl],
      creator: seo.twitterHandle,
    },
    robots: {
      index: seo.robotsIndex,
      follow: seo.robotsFollow,
      googleBot: {
        index: seo.robotsIndex,
        follow: seo.robotsFollow,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/logo/logo.png', type: 'image/png' },
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { url: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
      ],
      shortcut: '/logo/logo.png',
      apple: [
        { url: '/logo/logo.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: seo.siteName,
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: VIEWPORT_THEME_COLOR_LIGHT },
    { media: '(prefers-color-scheme: dark)', color: VIEWPORT_THEME_COLOR_DARK },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialThemeSettings = await getPublicThemeSettings();
  // Tema paleti ilk HTML'de (FOUC yok); istemci aynı türetmeyle yalnız değişiklikte yeniden yazar.
  const runtimeThemeCss = buildRuntimeThemeCss(runtimeThemeStateFromRows(initialThemeSettings));

  return (
    <html
      lang="tr"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <Script id="qratex-theme-class" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeClassInitScript(readDefaultMode(initialThemeSettings)) }} />
        {/* Yalnız sayısal HSL üçlüleri (lib/design-system/theme-runtime) — kullanıcı metni içermez. */}
        {runtimeThemeCss ? <style id={RUNTIME_THEME_STYLE_ID} dangerouslySetInnerHTML={{ __html: runtimeThemeCss }} /> : null}
        {/* Logo preload KALDIRILDI: header <Image priority> next/image'in KENDİ preload'unu
            (/_next/image?url=... optimize URL) üretiyor; raw /logo/logo.png preload'u onunla
            eşleşmiyordu → "preloaded but not used" uyarısı + boşa indirme. */}
        <link rel="icon" type="image/png" href="/logo/logo.png" />
        <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml" />
      </head>
      <body className="min-h-dvh bg-background font-sans antialiased" suppressHydrationWarning>
        <Providers initialThemeSettings={initialThemeSettings}>
          <PageTransition>
            {children}
          </PageTransition>
          {/* Capacitor native kabuk köprüsü (web'de etkisiz). */}
          <NativeBridge />
          <ChatbotLazy />
          {/* Toaster eager: Sonner bağlanmadan atılan toast'ları düşürür (ilk yük mount bildirimleri). */}
          <Toaster />
          {/* Ölçüm (Vercel çerezsiz/URL redaksiyonlu; PostHog yalnız rızayla, P0-31)
              ilk JS'te değil: hidrasyondan sonra ayrı parça olarak yüklenir (perf: / LCP). */}
          <DeferredRootIslands />
          {/* Rıza bildirimi + tercih merkezi tüm yüzeylerde (panele doğrudan girişte de). */}
          <CookieConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
