/**
 * Huni yükleme iskeleti — statik (shimmer yok, §4.2 kural 4), son yerleşimle aynı iskelet:
 * üst çubuk, logo, soru, beş yıldız yeri. Ekran okuyucuya tek "yükleniyor" duyurusu.
 */
export default function FeedbackLoading() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-0" role="status" aria-live="polite">
      <span className="sr-only">Yükleniyor…</span>
      <div className="border-b border-subtle bg-surface-1">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 py-2.5" aria-hidden>
          <div className="h-10 w-10 rounded-control bg-surface-3" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-40 rounded bg-surface-3" />
            <div className="h-3 w-24 rounded bg-surface-3" />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-lg gap-1.5 px-4 pb-2" aria-hidden>
          <div className="h-1 flex-1 rounded-full bg-surface-3" />
          <div className="h-1 flex-1 rounded-full bg-surface-3" />
          <div className="h-1 flex-1 rounded-full bg-surface-3" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 px-4 pt-9" aria-hidden>
        <div className="h-16 w-16 rounded-control bg-surface-3" />
        <div className="h-7 w-64 max-w-full rounded bg-surface-3" />
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 w-14 rounded-control bg-surface-3" />
          ))}
        </div>
      </div>
    </div>
  );
}
