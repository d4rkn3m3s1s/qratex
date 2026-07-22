import type { Metadata } from 'next';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { DashboardHeader } from '@/components/dashboard/header';
import { OnboardingSheet } from '@/components/onboarding/onboarding-sheet';
import { CustomerBirthdayBonusHost } from '@/components/customer/customer-birthday-bonus-host';
import { QrScanFab } from '@/components/customer/qr-scan-fab';
import { WebVitalsReporter } from '@/components/telemetry/web-vitals-reporter';
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
  const seo = await getSeoSettings();
  return (
    <div className="customer-shell flex min-h-dvh overflow-x-hidden">
      <SkipToMainContent />
      <Sidebar role="CUSTOMER" siteName={seo.siteName} />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-4 sm:pr-4 lg:pl-6 lg:pr-6">
        <DashboardHeader showSearch />
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 min-w-0 w-full max-w-[100vw] break-words py-3 sm:py-5 lg:py-6 overflow-x-hidden overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {children}
        </main>
      </div>
      <QrScanFab />
      <OnboardingSheet />
      <CustomerBirthdayBonusHost />
      <WebVitalsReporter />
    </div>
  );
}

