import { Skeleton } from '@/components/ui/skeleton';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';

/**
 * Panel segmenti (admin / bayi / müşteri) yükleme iskeleti — YALNIZ içerik bölgesi.
 *
 * `loading.tsx` aynı segmentin `layout.tsx`'inin İÇİNE (sayfanın Suspense sınırına) yerleşir;
 * gerçek Sidebar + DashboardHeader + `<main>` zaten çizili. Eskiden bu bileşen tam ekran kabuk
 * (sahte `lg:w-72` kenar çubuğu + sahte yapışkan başlık, `min-h-dvh`) çiziyordu → her panel içi
 * gezinmede ikinci kenar çubuğu ve ikinci başlık şeridi görünüyor, düzen sıçrıyordu (tasarım
 * raporu Y3). Statik: shimmer/sonsuz animasyon yok (QDL motion kuralı).
 */
export default async function DashboardRouteLoading() {
  const locale = await getServerLocale();
  const ariaLabel = t(locale, 'appShell.pageLoading');

  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={ariaLabel} className="space-y-section">
      <div aria-hidden className="space-y-section">
        {/* Sayfa başlığı (PageHeader compact) */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-28 rounded-chip" />
          <Skeleton className="h-8 w-56 max-w-[80%] rounded-chip" />
          <Skeleton className="h-4 w-80 max-w-full rounded-chip" />
        </div>
        {/* Metrik ızgarası */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
        {/* Ana bölüm */}
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    </div>
  );
}
