import { SkeletonDetail } from '@/components/states/skeletons';
import { LoadingLabel } from '@/components/layout/loading-label';

/** Sekme içeriği yüklenirken kabuk (başlık + sekmeler) yerinde kalır; yalnız içerik iskeleti. */
export default function WalletLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <LoadingLabel />
      <SkeletonDetail />
    </div>
  );
}
