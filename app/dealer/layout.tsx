import type { Metadata } from 'next';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { DashboardHeader } from '@/components/dashboard/header';
import { OnboardingSheet } from '@/components/onboarding/onboarding-sheet';
import { WebVitalsReporter } from '@/components/telemetry/web-vitals-reporter';
import { RealtimeNotifications } from '@/components/dashboard/realtime-notifications';
import { getSeoSettings } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';

export async function generateMetadata(): Promise<Metadata> {
  const [seo, locale] = await Promise.all([getSeoSettings(), getServerLocale()]);
  const panelLabel = t(locale, 'layoutMetadata.dealer');
  return {
    title: {
      default: panelLabel,
      template: `%s | ${panelLabel}`,
    },
    applicationName: seo.siteName,
  };
}

export default async function DealerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const seo = await getSeoSettings();
  return (
    <div className="flex min-h-dvh overflow-x-hidden">
      <SkipToMainContent />
      <Sidebar role="DEALER" siteName={seo.siteName} />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-4 sm:pr-4 lg:pl-6 lg:pr-6">
        <DashboardHeader showSearch={true} />
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 min-w-0 w-full max-w-[100vw] break-words py-3 sm:py-5 lg:py-6 overflow-x-hidden overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {children}
        </main>
      </div>
      <OnboardingSheet />
      <WebVitalsReporter />
      <RealtimeNotifications />
    </div>
  );
}

