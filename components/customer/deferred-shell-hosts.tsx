'use client';

/**
 * Müşteri kabuğunun ertelenmiş istemci katmanları (perf: lh-performance-mobile / lcp-mobile).
 *
 * Onboarding, karşılama videosu, doğum günü bonusu ve An Motoru (puan kapsülü + sahneler)
 * oturum gelene kadar zaten hiçbir şey çizmez; sunucuda HTML üretmezler. Bu yüzden ilk yük
 * paketinden çıkarılıp hidrasyondan SONRA ayrı parçalar olarak yüklenirler — davranış aynı,
 * yalnız sayfanın LCP öğesi ve ana iş parçacığı bu kodu beklemez. Parçalar sayfa `load`
 * olayından sonra, tarayıcı boşta kaldığında istenir (ilk boyamayla bant genişliği yarışmaz).
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const OnboardingSheet = dynamic(() => import('@/components/onboarding/onboarding-sheet').then((m) => m.OnboardingSheet), { ssr: false });
const WelcomeVideoModal = dynamic(() => import('./welcome-video-modal').then((m) => m.WelcomeVideoModal), { ssr: false });
const CustomerBirthdayBonusHost = dynamic(
  () => import('./customer-birthday-bonus-host').then((m) => m.CustomerBirthdayBonusHost),
  { ssr: false },
);
const MomentHost = dynamic(() => import('@/components/moments/moment-host').then((m) => m.MomentHost), { ssr: false });
const WebVitalsReporter = dynamic(
  () => import('@/components/telemetry/web-vitals-reporter').then((m) => m.WebVitalsReporter),
  { ssr: false },
);
const ServiceWorkerRegistrar = dynamic(
  () => import('@/components/pwa/service-worker-registrar').then((m) => m.ServiceWorkerRegistrar),
  { ssr: false },
);

/** `load` + boşta (en geç 2 sn) sonra `true`. */
function useAfterLoadIdle(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idleId: number | undefined;
    let timer: number | undefined;
    const go = () => {
      if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      else timer = window.setTimeout(() => setReady(true), 200);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => {
      window.removeEventListener('load', go);
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return ready;
}

export function DeferredCustomerShellHosts() {
  const ready = useAfterLoadIdle();
  if (!ready) return null;
  return (
    <>
      <OnboardingSheet />
      {/* Karşılama videosu: dosya (public/videos/welcome-customer.mp4) yoksa hiç açılmaz. */}
      <WelcomeVideoModal />
      <CustomerBirthdayBonusHost />
      {/* An Motoru: puan kapsülü + seviye/lig/rozet anları (tam bir kez; açık dialog varken bekler). */}
      <MomentHost />
      <WebVitalsReporter />
      {/* PWA: SW yalnız panelde kaydedilir; QR hunisinde hiç kurulmaz (P0-37). */}
      <ServiceWorkerRegistrar />
    </>
  );
}
