import { getServerLocale } from '@/lib/server-locale';
import { SkeletonList, SkeletonStats } from '@/components/states';

/** Gelen Kutusu yükleniyor: statik iskelet (shimmer yok, ops kaydı). Kabuk (başlık + sekmeler) layout'ta kalır. */
export default async function Loading() {
  const en = (await getServerLocale()) === 'en';
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">{en ? 'Loading inbox' : 'Gelen kutusu yükleniyor'}</span>
      <SkeletonStats />
      <div className="h-11 w-full rounded-control bg-surface-muted" />
      <SkeletonList rows={6} />
    </div>
  );
}
