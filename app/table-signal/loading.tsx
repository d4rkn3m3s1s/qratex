/** Masa sinyali — statik iskelet (QDL: yükleme iskeleti statik, shimmer yok). */
export default function TableSignalLoading() {
  return (
    <main className="min-h-dvh bg-background" aria-busy="true">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-5 sm:pt-8">
        <span className="sr-only" role="status">
          Yükleniyor…
        </span>
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-12 w-12 rounded-control bg-surface-3" />
          <span className="h-4 w-40 rounded bg-surface-3" />
        </div>
        <span className="h-8 w-3/4 rounded bg-surface-3" aria-hidden />
        <div className="grid grid-cols-2 gap-3" aria-hidden>
          <span className="h-[8.5rem] rounded-card bg-surface-2" />
          <span className="h-[8.5rem] rounded-card bg-surface-2" />
        </div>
        <span className="h-24 rounded-card bg-surface-2" aria-hidden />
      </div>
    </main>
  );
}
