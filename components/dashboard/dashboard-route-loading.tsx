import { Skeleton } from '@/components/ui/skeleton';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';

/**
 * Shell-aligned skeleton while dashboard segment RSC payloads stream in.
 */
export default async function DashboardRouteLoading() {
  const locale = await getServerLocale();
  const ariaLabel = t(locale, 'appShell.pageLoading');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <div className="flex min-h-dvh w-full overflow-x-hidden bg-background" aria-hidden>
        <div className="hidden shrink-0 border-r border-border/40 bg-muted/20 lg:block lg:w-64" />
        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden px-3 sm:px-4 lg:px-6">
          <div className="-mx-3 mb-3 min-h-14 border-b border-border/60 bg-background/90 px-3 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 supports-[padding:env(safe-area-inset-top)]:pt-[env(safe-area-inset-top)] sm:-mx-4 sm:mb-4 sm:min-h-16 sm:px-4 lg:-mx-6 lg:px-6 sm:py-0">
            <div className="flex h-12 items-center gap-3 sm:h-16">
              <Skeleton className="hidden h-9 flex-1 rounded-lg sm:block sm:max-w-md" />
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            </div>
          </div>
          <div className="flex-1 space-y-4 pb-6">
            <Skeleton className="h-8 w-48 max-w-[80%] rounded-md" />
            <Skeleton className="h-36 w-full rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl sm:col-span-2 lg:col-span-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
