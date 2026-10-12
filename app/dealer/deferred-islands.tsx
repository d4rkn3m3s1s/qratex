'use client';

import dynamic from 'next/dynamic';

/**
 * Bayi kabuğunun görünmez istemci adaları (Web Vitals raporu, canlı bildirim akışı, SW kaydı).
 * İlk boyamaya katkıları yok; ssr:false + ayrı parça → ilk hidrasyonun ana iş parçacığı
 * maliyetinden (Lighthouse TBT) çıkarılır, sayfa etkileşimli olduktan sonra yüklenir.
 */
const WebVitalsReporter = dynamic(
  () => import('@/components/telemetry/web-vitals-reporter').then((m) => m.WebVitalsReporter),
  { ssr: false },
);
const RealtimeNotifications = dynamic(
  () => import('@/components/dashboard/realtime-notifications').then((m) => m.RealtimeNotifications),
  { ssr: false },
);
const ServiceWorkerRegistrar = dynamic(
  () => import('@/components/pwa/service-worker-registrar').then((m) => m.ServiceWorkerRegistrar),
  { ssr: false },
);

export function DealerDeferredIslands() {
  return (
    <>
      <WebVitalsReporter />
      <RealtimeNotifications />
      {/* PWA: SW yalnız panelde kaydedilir; QR hunisinde hiç kurulmaz (P0-37). */}
      <ServiceWorkerRegistrar />
    </>
  );
}
