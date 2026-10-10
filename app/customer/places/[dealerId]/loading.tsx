import { SkeletonDetail } from '@/components/states';

/** Mekân detayı iskeleti — statik (shimmer yok, §4.2 kural 4). */
export default function VenueDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl" role="status" aria-busy="true">
      <span className="sr-only">Yükleniyor…</span>
      <SkeletonDetail />
    </div>
  );
}
