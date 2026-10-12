import { LoadingLabel } from '@/components/layout/loading-label';

/**
 * Blog iskeleti. Kök neden (ölçüldü, CLS 0.344): ortak okuma iskeleti kısa olduğundan footer ilk
 * ekranda görünüyor, akışla gelen içerik onu ekran dışına itiyordu. Burada iskelet en az bir
 * görüntü alanı yüksekliğinde (min-h-dvh) ve sayfanın yerleşimini (başlık, kategori çipleri,
 * öne çıkan kart, ızgara) taklit eder → footer ilk boyamada zaten katın altında. Statik, shimmer yok.
 */
export default function BlogLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
      <LoadingLabel kind="page" />
      <div aria-hidden>
        <div className="h-4 w-40 rounded-chip bg-surface-3" />
        <div className="mt-6 max-w-2xl space-y-3">
          <div className="h-3 w-16 rounded-chip bg-surface-3" />
          <div className="h-9 w-3/4 rounded-control bg-surface-3" />
          <div className="h-4 w-full rounded-chip bg-surface-2" />
          <div className="h-4 w-5/6 rounded-chip bg-surface-2" />
        </div>
        <div className="mt-8 flex gap-2">
          <div className="h-11 w-20 rounded-full bg-surface-2" />
          <div className="h-11 w-32 rounded-full bg-surface-2" />
          <div className="h-11 w-28 rounded-full bg-surface-2" />
        </div>
        <div className="mt-8 h-64 w-full rounded-card bg-surface-2" />
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-72 rounded-card bg-surface-2" />
          <div className="h-72 rounded-card bg-surface-2" />
          <div className="h-72 rounded-card bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
