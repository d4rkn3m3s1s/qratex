import { SkeletonBlock } from '@/components/states';

/** Tara iskeleti — sayfa yerleşimiyle aynı ızgara (yerleşim kayması yok). Statik, shimmer yok. */
export default function CustomerScanLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5" role="status" aria-busy="true">
      <span className="sr-only">Yükleniyor…</span>
      <SkeletonBlock className="h-14 w-2/3 max-w-sm" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
        <div className="space-y-4">
          <SkeletonBlock className="h-64 rounded-sheet" />
          <SkeletonBlock className="h-40" />
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-44" />
          <SkeletonBlock className="h-56" />
        </div>
      </div>
    </div>
  );
}
