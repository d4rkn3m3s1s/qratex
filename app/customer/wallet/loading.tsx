import { SkeletonDetail } from '@/components/states/skeletons';

/** Sekme içeriği yüklenirken kabuk (başlık + sekmeler) yerinde kalır; yalnız içerik iskeleti. */
export default function WalletLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Yükleniyor…</span>
      <SkeletonDetail />
    </div>
  );
}
