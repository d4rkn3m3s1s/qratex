'use client';

import dynamic from 'next/dynamic';

/**
 * Kök layout'un ilk boyamaya katkısı olmayan istemci adaları (perf kapısı: / LCP, mobil perf).
 * Her biri ayrı parça; sunucu HTML'i ve ilk JS'e girmez, hidrasyondan hemen sonra yüklenir.
 *  - Toaster: bildirimler kullanıcı etkileşiminden sonra gelir; o ana kadar bağlanmış olur.
 *  - Vercel Analytics/Speed Insights ve PostHog: ölçüm, sayfa içeriğiyle yarışmasın.
 */
const Toaster = dynamic(() => import('@/components/ui/toaster').then((m) => m.Toaster), { ssr: false });
const VercelAnalytics = dynamic(
  () => import('@/components/analytics/vercel-analytics').then((m) => m.VercelAnalytics),
  { ssr: false }
);
const PostHogProvider = dynamic(
  () => import('@/components/analytics/posthog-provider').then((m) => m.PostHogProvider),
  { ssr: false }
);

export function DeferredRootIslands() {
  return (
    <>
      <Toaster />
      <VercelAnalytics />
      <PostHogProvider />
    </>
  );
}
