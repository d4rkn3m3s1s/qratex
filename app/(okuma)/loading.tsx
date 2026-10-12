import { LoadingLabel } from '@/components/layout/loading-label';
/**
 * Okuma sayfaları için hafif, statik iskelet (başlık + paragraf). Tam ekran marka katmanı ve
 * sonsuz animasyon YOK — §4.2: "yükleme iskeleti statik, shimmer yok".
 * CLS (kalite kapısı, /blog 0.344 — ölçüldü): akışta önce BU dış iskelet boyanıyor; kısa olduğundan
 * footer ilk ekranda görünüp içerik gelince aşağı itiliyordu. En az bir görüntü alanı yüksekliği
 * (min-h-dvh) footer'ı ilk boyamada katın altında tutar.
 */
export default function ReadingLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
      <LoadingLabel kind="page" />
      <div aria-hidden className="max-w-3xl space-y-4">
        <div className="h-4 w-40 rounded-chip bg-surface-3" />
        <div className="h-9 w-3/4 rounded-control bg-surface-3" />
        <div className="h-4 w-full rounded-chip bg-surface-2" />
        <div className="h-4 w-5/6 rounded-chip bg-surface-2" />
        <div className="mt-8 h-32 w-full rounded-card bg-surface-2" />
        <div className="h-4 w-full rounded-chip bg-surface-2" />
        <div className="h-4 w-11/12 rounded-chip bg-surface-2" />
        <div className="h-4 w-4/5 rounded-chip bg-surface-2" />
      </div>
    </div>
  );
}
