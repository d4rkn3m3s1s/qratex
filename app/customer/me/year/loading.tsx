import { LoadingLabel } from '@/components/layout/loading-label';
/**
 * Yılım yükleniyor: kapak + çip satırı + özet ızgarası iskeleti (statik; shimmer yok, §4.2).
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6" aria-busy="true" aria-live="polite">
      <LoadingLabel />
      <div className="h-64 rounded-3xl bg-muted sm:h-72" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-11 w-16 shrink-0 rounded-full bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-32 rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
