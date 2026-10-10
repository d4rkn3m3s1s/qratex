/**
 * Ana Sayfa iskeleti — gerçek yerleşimin statik kopyası (shimmer yok, §4.2 kural 4).
 * Yalnız SSR verisi alınamadığında ve istemci isteği beklenirken görünür; sahte ad/puan/
 * "hoş geldin" içeriği asla çizilmez.
 */
function Block({ className }: { className: string }) {
  return <div className={`rounded-card bg-surface-3 ${className}`} />;
}

export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5" aria-hidden>
      <div className="rounded-sheet border border-subtle bg-surface-1 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="size-14 rounded-full bg-surface-3" />
          <div className="flex-1 space-y-2">
            <Block className="h-3 w-24" />
            <Block className="h-5 w-40" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-4">
          <div className="space-y-2">
            <Block className="h-3 w-16" />
            <Block className="h-10 w-36" />
          </div>
          <div className="size-[76px] rounded-full bg-surface-3" />
        </div>
        <Block className="mt-5 h-16 w-full" />
        <Block className="mt-4 h-12 w-full sm:w-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Block className="h-56 w-full" />
          <Block className="h-48 w-full" />
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Block className="h-36 w-full" />
          <Block className="h-44 w-full" />
        </div>
      </div>
    </div>
  );
}
