/**
 * Herkese açık sayfalar için hafif yükleme iskeleti (landing.md Bulgu 16, neden-qratex.md
 * Bulgu 10, guven.md Bulgu 11). Eskiden `fixed inset-0 z-[100]` tam ekran perde header'ı da
 * örtüyor ve sonsuz animasyon döndürüyordu; şimdi yalnız içerik alanında, statik (shimmer
 * yok — QDL motion kuralı), header ve footer görünür kalır. Sunucu bileşeni: istemci JS yok.
 */
export default function PublicLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
      <span className="sr-only">Sayfa yükleniyor…</span>
      <div aria-hidden className="space-y-6">
        <div className="h-4 w-32 rounded-full bg-fg/10" />
        <div className="h-10 w-full max-w-xl rounded-control bg-fg/10" />
        <div className="h-4 w-full max-w-2xl rounded-full bg-fg/[0.07]" />
        <div className="h-4 w-full max-w-lg rounded-full bg-fg/[0.07]" />
        <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 rounded-card border border-subtle bg-surface-1/70" />
          ))}
        </div>
      </div>
    </div>
  );
}
