import type { Metadata } from 'next';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { DashboardHeader } from '@/components/dashboard/header';
import { ShellProvider } from '@/components/dashboard/shell-context';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { NavClickTracker } from '@/components/dashboard/nav-click-tracker';
import { OnboardingSheet } from '@/components/onboarding/onboarding-sheet';
import { WebVitalsReporter } from '@/components/telemetry/web-vitals-reporter';
import { getSeoSettings } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';
import { Admin2faBanner } from '@/components/admin/admin-2fa-banner';
import { requireAdminPage } from '@/lib/auth/admin-page-guard';
import { ServerLocaleBoundary } from '@/lib/server-locale-boundary';

export async function generateMetadata(): Promise<Metadata> {
  const [seo, locale] = await Promise.all([getSeoSettings(), getServerLocale()]);
  const adminLabel = t(locale, 'layoutMetadata.admin');
  return {
    // Panel sayfaları asla dizine girmez (admin robots listesini değiştirse bile).
    robots: { index: false, follow: false },
    title: {
      default: adminLabel,
      template: `%s | ${adminLabel}`,
    },
    applicationName: seo.siteName,
  };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sunucu tarafı rol + gizli kapı denetimi (proxy'ye ek savunma katmanı; bkz. lib/auth/admin-page-guard).
  const { setupRequired } = await requireAdminPage();
  // Menü sunucuda, kayıttan ve önbellekten çözülür (lib/navigation) — istemci isteği yok.
  const [seo, shell] = await Promise.all([getSeoSettings(), getShellConfig('admin')]);
  return (
    <ServerLocaleBoundary>
    <ShellProvider shell={shell}>
    <div className="flex min-h-dvh overflow-x-hidden">
      <SkipToMainContent />
      <NavClickTracker source="sidebar">
        <Sidebar role="ADMIN" siteName={seo.siteName} />
      </NavClickTracker>
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-4 sm:pr-4 lg:pl-6 lg:pr-6">
        <DashboardHeader showSearch={!setupRequired} showNotifications={!setupRequired} />
        <Admin2faBanner />
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 min-w-0 w-full max-w-[100vw] break-words py-3 sm:py-5 lg:py-6 overflow-x-hidden overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {children}
        </main>
      </div>
      {!setupRequired && <OnboardingSheet />}
      <WebVitalsReporter />
    </div>
    </ShellProvider>
    </ServerLocaleBoundary>
  );
}

