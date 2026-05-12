import { Skeleton } from '@/components/ui/skeleton';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';

/**
 * Staff layout shell: single sticky header + scrollable main (no sidebar rail).
 */
export default async function StaffRouteLoading() {
  const locale = await getServerLocale();
  const ariaLabel = t(locale, 'appShell.pageLoading');

  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={ariaLabel}>
      <div className="flex min-h-dvh flex-col bg-background" aria-hidden>
        <header className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 supports-[padding:env(safe-area-inset-top)]:pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center justify-between px-3 sm:px-4 md:px-6">
            <Skeleton className="h-6 w-44 max-w-[55vw] rounded-md sm:w-56" />
            <div className="flex items-center gap-2 sm:gap-3">
              <Skeleton className="hidden h-4 w-28 rounded sm:block" />
              <Skeleton className="h-9 w-16 rounded-md" />
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 md:px-6 sm:py-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-40 max-w-[70%] rounded-md" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
