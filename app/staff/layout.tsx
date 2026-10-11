import type { Metadata } from 'next';
import Link from 'next/link';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getSeoSettings } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';
import { WebVitalsReporter } from '@/components/telemetry/web-vitals-reporter';
import { StaffNav } from '@/components/dashboard/staff-nav';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { getActiveStaffDealerId } from '@/lib/auth/scope';
import { StaffSignOutButton } from '@/components/staff/b-ekip/sign-out-button';
import { StaffInactiveNotice } from '@/components/staff/b-ekip/inactive-notice';
import { ServerLocaleBoundary } from '@/lib/server-locale-boundary';

export async function generateMetadata(): Promise<Metadata> {
  const [seo, locale] = await Promise.all([getSeoSettings(), getServerLocale()]);
  const panelLabel = t(locale, 'layoutMetadata.staff');
  return {
    title: {
      default: panelLabel,
      template: `%s | ${panelLabel}`,
    },
    applicationName: seo.siteName,
  };
}

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'STAFF') {
    redirect('/auth/login');
  }
  // A2: pasif personel panele giremez (DB kaynak-doğruluk; DB'ye ulaşılamazsa sayfa kendi hatasını gösterir).
  const [seo, shell, locale, activeDealerId] = await Promise.all([
    getSeoSettings(),
    getShellConfig('staff'),
    getServerLocale().catch(() => 'tr' as const),
    getActiveStaffDealerId(session.user.id).catch(() => undefined),
  ]);
  const en = locale === 'en';
  const inactive = activeDealerId === null;
  return (
    <ServerLocaleBoundary>
    <div className="min-h-dvh flex flex-col bg-background">
      <SkipToMainContent targetId="staff-main" />
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-14 items-center justify-between px-3 sm:px-4 md:px-6">
          <Link href="/staff" className="font-semibold text-base sm:text-lg tracking-tight hover:text-primary transition-colors">
            {seo?.siteName ?? 'QRateX'} · {en ? 'Staff' : 'Personel'}
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline max-w-[200px] truncate">
              {session.user.name ?? session.user.email}
            </span>
            <StaffSignOutButton label={en ? 'Sign out' : 'Çıkış'} />
          </div>
        </div>
        {!inactive && <StaffNav nodes={shell.nodes} homeHref={shell.homeHref} />}
      </header>
      <main
        id="staff-main"
        tabIndex={-1}
        className="flex-1 px-3 sm:px-4 md:px-6 py-4 sm:py-6 overflow-x-hidden overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {inactive ? <StaffInactiveNotice /> : children}
      </main>
      <WebVitalsReporter />
    </div>
    </ServerLocaleBoundary>
  );
}
