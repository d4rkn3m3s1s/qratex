/** Kart sayfası — statik iskelet (QDL: yükleme iskeleti statik, shimmer yok). */
export default function CardLoading() {
  return (
    <main className="min-h-dvh bg-background" aria-busy="true">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-5 sm:pt-8">
        <span className="sr-only" role="status">
          Kart yükleniyor…
        </span>
        <span className="h-8 w-28 rounded bg-surface-3" aria-hidden />
        <span className="aspect-[1.586/1] w-full rounded-[22px] bg-surface-3" aria-hidden />
        <span className="h-8 w-3/4 rounded bg-surface-3" aria-hidden />
        <span className="h-4 w-full rounded bg-surface-2" aria-hidden />
        <span className="h-12 w-full rounded-lg bg-surface-2" aria-hidden />
      </div>
    </main>
  );
}
