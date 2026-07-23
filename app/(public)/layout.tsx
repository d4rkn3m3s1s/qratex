import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { CookieConsentBanner } from '@/components/layout/cookie-consent-banner';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import LandingBackground from '@/components/landing/LandingBackground';
import { getBackgroundEffect } from '@/lib/get-background-effect';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const backgroundEffect = await getBackgroundEffect();
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Tüm public sayfayı (header + içerik + footer) kaplayan tek bütünsel hareketli
          arka plan. fixed z-0; içerik z-[1] ile üstünde durur, hepsi şeffaf zemini gösterir. */}
      <LandingBackground initialBackgroundEffect={backgroundEffect} />
      <SkipToMainContent targetId="main-content" label="İçeriğe atla" />
      <div className="relative z-[1] flex min-h-dvh flex-col">
        <Header />
        <main
          id="main-content"
          className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          tabIndex={-1}
        >
          {children}
        </main>
        <Footer />
      </div>
      <CookieConsentBanner />
    </div>
  );
}

