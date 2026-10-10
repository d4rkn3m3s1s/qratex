import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';
import { getServerLocale } from '@/lib/server-locale';

// Sayfanın gerçekte yaptığını anlatan açıklama (eski metin olmayan "katılım durumu"nu vaat ediyordu).
const DESCRIPTION = {
  tr: 'İşletmelerin mutlu saat kampanyaları: şu an canlı olanlar ve sıradakiler, senin saatinle.',
  en: 'Happy hour campaigns from businesses: what is live now and what comes next, in your time.',
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const [base, locale] = await Promise.all([
    segmentLayoutMetadata('layoutMetadata.customerCampaigns', 'layoutMetadata.customerCampaignsDescription'),
    getServerLocale(),
  ]);
  return { ...base, description: DESCRIPTION[locale === 'en' ? 'en' : 'tr'] };
}

export default function CustomerCampaignsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
