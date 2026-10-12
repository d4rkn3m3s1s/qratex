'use client';

import dynamic from 'next/dynamic';

/**
 * Kök layout'un ilk boyamaya katkısı olmayan istemci adaları (perf kapısı: / LCP, mobil perf).
 * Her biri ayrı parça; sunucu HTML'i ve ilk JS'e girmez, hidrasyondan hemen sonra yüklenir.
 *  - Toaster BURADA DEĞİL (kök layout'ta eager): Sonner, Toaster bağlanmadan önce atılan toast'ları
 *    saklamaz (useState([]) + subscribe). Ertelenince ilk yükte mount efektinden atılanlar kayboluyordu
 *    (ör. ödeme dönüşü ?status=cancel bildirimi).
 *  - Vercel Analytics/Speed Insights ve PostHog: ölçüm, sayfa içeriğiyle yarışmasın.
 */
const VercelAnalytics = dynamic(
  () => import('@/components/analytics/vercel-analytics').then((m) => m.VercelAnalytics),
  { ssr: false }
);
const PostHogProvider = dynamic(
  () => import('@/components/analytics/posthog-provider').then((m) => m.PostHogProvider),
  { ssr: false }
);

// Arayüz sesleri: toast başarı/hata sesi tek noktadan (lib/sound). Ses motoru ilk JS'e girmez.
const ToastSoundBridge = dynamic(
  () => import('@/components/sound/toast-sound-bridge').then((m) => m.ToastSoundBridge),
  { ssr: false }
);

export function DeferredRootIslands() {
  return (
    <>
      <VercelAnalytics />
      <PostHogProvider />
      <ToastSoundBridge />
    </>
  );
}
