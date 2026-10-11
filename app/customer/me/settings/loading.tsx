import { SettingsSkeleton } from '@/components/customer/m-ayarlar/settings-skeleton';
import { LoadingLabel } from '@/components/layout/loading-label';

/** Ayarlar yükleniyor: statik iskelet (shimmer yok, ops kaydı). */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-3xl space-y-5">
      <LoadingLabel tr="Ayarlar yükleniyor…" en="Loading settings…" />
      <div className="h-8 w-40 rounded-control bg-surface-muted" />
      <SettingsSkeleton />
    </div>
  );
}
