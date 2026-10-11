import type { Metadata } from 'next';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { DashboardHeader } from '@/components/dashboard/header';
import { ShellProvider } from '@/components/dashboard/shell-context';
import { ShellTabBar } from '@/components/dashboard/shell-tab-bar';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { NavClickTracker } from '@/components/dashboard/nav-click-tracker';
import { RouteGate } from '@/components/dashboard/route-gate';
import { OnboardingSheet } from '@/components/onboarding/onboarding-sheet';
import { CustomerBirthdayBonusHost } from '@/components/customer/customer-birthday-bonus-host';
import { WelcomeVideoModal } from '@/components/customer/welcome-video-modal';
import { MomentHost } from '@/components/moments/moment-host';
import { WebVitalsReporter } from '@/components/telemetry/web-vitals-reporter';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { getSeoSettings } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';
import './customer-shell.css';

export async function generateMetadata(): Promise<Metadata> {
  const [seo, locale] = await Promise.all([getSeoSettings(), getServerLocale()]);
  const panelLabel = t(locale, 'layoutMetadata.customer');
  return {
    title: {
      default: panelLabel,
      template: `%s | ${panelLabel}`,
    },
    applicationName: seo.siteName,
  };
}

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Menü sunucuda, kayıttan ve önbellekten çözülür (lib/navigation) — istemci isteği yok.
  const [seo, shell] = await Promise.all([getSeoSettings(), getShellConfig('customer')]);
  return (
    <ShellProvider shell={shell}>
    {/* --qx-tabbar-h: alt sekme çubuğu yüksekliği; alt kenara yapışan katmanlar bununla kayar. */}
    <div className="customer-shell flex min-h-dvh overflow-x-hidden [--qx-tabbar-h:calc(4rem+env(safe-area-inset-bottom,0px))] lg:[--qx-tabbar-h:0px]">
      <SkipToMainContent />
      <NavClickTracker source="sidebar">
        <Sidebar role="CUSTOMER" siteName={seo.siteName} />
      </NavClickTracker>
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-4 sm:pr-4 lg:pl-6 lg:pr-6">
        <DashboardHeader showSearch />
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 min-w-0 w-full max-w-[100vw] break-words py-3 sm:py-5 lg:py-6 overflow-x-hidden overflow-y-auto pb-[calc(var(--qx-tabbar-h)+1.5rem)] sm:pb-[calc(var(--qx-tabbar-h)+1.5rem)] lg:pb-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {/* Menüden gizlenen / modülü kapalı bölüm URL'den açılırsa "kullanılamıyor" durumu (B11). */}
          <RouteGate>{children}</RouteGate>
        </main>
      </div>
      <OnboardingSheet />
      {/* Karşılama videosu: dosya (public/videos/welcome-customer.mp4) yoksa hiç açılmaz. */}
      <WelcomeVideoModal />
      <CustomerBirthdayBonusHost />
      {/* An Motoru: puan kapsülü + seviye/lig/rozet anları (tam bir kez; açık dialog varken bekler). */}
      <MomentHost />
      <WebVitalsReporter />
      {/* PWA: SW yalnız panelde kaydedilir; QR hunisinde hiç kurulmaz (P0-37). */}
      <ServiceWorkerRegistrar />
      {/* Mobil alt sekme: Ana Sayfa · Keşfet · TARA · Oyna · Cüzdan (lg altında). */}
      <NavClickTracker source="tabbar">
        <ShellTabBar />
      </NavClickTracker>
    </div>
    </ShellProvider>
  );
}

