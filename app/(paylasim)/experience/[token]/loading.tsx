import { LoadingLabel } from '@/components/layout/loading-label';
/** Kart yüklenirken statik iskelet (shimmer yok — §4.2). Yerleşim kartla aynı → sıçrama yok. */
export default function ExperienceLoading() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6 sm:py-10" role="status" aria-busy="true">
      <LoadingLabel />
      <div aria-hidden className="space-y-5 rounded-sheet border border-subtle bg-surface-1 p-5 sm:p-6">
        <div className="h-3 w-32 rounded bg-surface-3" />
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-card bg-surface-3" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-3/4 rounded bg-surface-3" />
            <div className="h-4 w-1/2 rounded bg-surface-3" />
          </div>
        </div>
        <div className="h-5 w-40 rounded bg-surface-3" />
        <div className="h-16 rounded-card bg-surface-2" />
      </div>
      <div aria-hidden className="h-12 rounded-control bg-surface-3" />
    </div>
  );
}
