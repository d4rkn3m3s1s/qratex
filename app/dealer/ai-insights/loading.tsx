import { Skeleton } from '@/components/ui/skeleton';
import { defaultLocale, t } from '@/i18n/request';

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label={t(defaultLocale, 'common.contentLoadingAria')}>
      <div className="space-y-6 pb-8" aria-hidden>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
