import { SkeletonCards } from '@/components/states/skeletons';

/** Bağış iskeleti: etki kartı + sekmeler + proje kartları (statik, shimmer yok). */
export default function WalletDonateLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Yükleniyor…</span>
      <div className="h-28 w-full rounded-card border border-subtle bg-surface-1" />
      <div className="h-11 w-full max-w-sm rounded-control bg-surface-muted" />
      <SkeletonCards />
    </div>
  );
}
