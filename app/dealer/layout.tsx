import type { Metadata } from 'next';
import { Sidebar } from '@/components/dashboard/sidebar';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { DashboardHeader } from '@/components/dashboard/header';
import { OnboardingSheet } from '@/components/onboarding/onboarding-sheet';
import { getSeoSettings } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings();
  const locale = await getServerLocale();
  return {
    title: t(locale, 'layoutMetadata.dealer'),
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
      <div className="flex-1 flex flex-col min-w-0 px-3 sm:px-4 lg:px-6 overflow-x-hidden">
        <DashboardHeader showSearch={true} />
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 min-w-0 w-full max-w-[100vw] break-words py-3 sm:py-5 lg:py-6 overflow-x-hidden overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {children}
        </main>
      </div>
      <OnboardingSheet />
    </div>
  );
}

