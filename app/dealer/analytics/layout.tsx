import { Suspense } from 'react';
import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { getServerLocale } from '@/lib/server-locale';
import { resolveAnalyticsTabs } from '@/lib/dealer-analytics/tabs';
import { AnalyticsTabs } from '@/components/dealer/b-analitik/analytics-tabs';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerAnalytics', 'layoutMetadata.dealerAnalyticsDescription');
}

/**
 * ANALİTİK KABUĞU (yol haritası §4.3 "Analitik /dealer/analytics (+ /insights · /benchmark ·
 * /impact)"): rota tabanlı sekme çubuğu — Genel · Yoğunluk · İçgörüler · Kıyas · Etki.
 *
 * Alt sayfa sözleşmesi:
 *  - Kabuk YALNIZ sekme çubuğunu çizer (`nav`); sayfa başlığını (`h1`) her alt sayfa kendi
 *    `PageHeader`'ı ile çizer (sekmeler farklı sorulara cevap verir, başlıkları da farklıdır).
 *  - Sekme listesi `lib/navigation/registry.ts` (`/dealer/analytics/…` öğeleri) + modül/menü
 *    görünürlüğünden türer; yeni sekme kayda eklenir, burada elle eklenmez.
 *  - Dönem/şube bağlamı (`period`, `from`, `to`, `compare`, `location`) sekmeler arası taşınır.
 *  - Kayıt `ops`: sonsuz döngü yok, iskelet statik.
 */
export default async function DealerAnalyticsLayout({ children }: { children: React.ReactNode }) {
  const [shell, locale] = await Promise.all([getShellConfig('dealer').catch(() => null), getServerLocale().catch(() => 'tr' as const)]);
  const tabs = resolveAnalyticsTabs(shell);
  return (
    <div data-register="ops" className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
      <Suspense fallback={<div className="h-11 border-b border-subtle" aria-hidden />}>
        <AnalyticsTabs tabs={tabs} ariaLabel={locale === 'en' ? 'Analytics sections' : 'Analitik bölümleri'} />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
