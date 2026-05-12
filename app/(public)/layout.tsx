import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { CookieConsentBanner } from '@/components/layout/cookie-consent-banner';
import { SkipToMainContent } from '@/components/layout/skip-to-main';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipToMainContent targetId="main-content" label="İçeriğe atla" />
      <Header />
      <main
        id="main-content"
        className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        tabIndex={-1}
      >
        {children}
      </main>
      <Footer />
      <CookieConsentBanner />
    </div>
  );
}

