import { LoadingLabel } from '@/components/layout/loading-label';
/** Anket kapağı iskeleti (statik, shimmer yok — §4.2); yerleşim kapakla aynı. */
export default function SurveyLoading() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12" role="status" aria-busy="true">
      <LoadingLabel />
      <div aria-hidden className="flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-card bg-surface-3" />
        <div className="h-4 w-28 rounded bg-surface-3" />
        <div className="h-8 w-3/4 rounded bg-surface-3" />
        <div className="h-4 w-full rounded bg-surface-2" />
        <div className="mt-3 flex gap-2">
          <div className="h-8 w-20 rounded-chip bg-surface-3" />
          <div className="h-8 w-20 rounded-chip bg-surface-3" />
          <div className="h-8 w-24 rounded-chip bg-surface-3" />
        </div>
        <div className="mt-4 h-12 w-full rounded-control bg-surface-3" />
      </div>
    </div>
  );
}
