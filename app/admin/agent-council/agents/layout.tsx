import type { Metadata } from 'next';
import { cache } from 'react';
import { getSeoSettings } from '@/lib/seo-settings';

const getSeoSettingsOnce = cache(getSeoSettings);

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettingsOnce();
  const ogLocale = seo.locale.replace('_', '-');
  return {
    title: 'Ajan profilleri',
    description:
      'Konseydeki uzman ajanların etki ağırlıklarını yapılandırın (Harper, Benjamin, Lucas, Grok).',
    robots: { index: false, follow: false },
    openGraph: {
      title: `Ajan profilleri · ${seo.siteName}`,
      description: 'Çoklu ajan konseyi ağırlık ayarları.',
      siteName: seo.siteName,
      locale: ogLocale,
      type: 'website',
    },
  };
}

export default function AgentCouncilAgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
