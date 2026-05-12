import type { Metadata } from 'next';
import { cache } from 'react';
import { getSeoSettings } from '@/lib/seo-settings';

const getSeoSettingsOnce = cache(getSeoSettings);

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettingsOnce();
  const ogLocale = seo.locale.replace('_', '-');
  return {
    title: 'Grok Konseyi',
    description:
      'Çoklu ajan tartışması: Harper, Benjamin, Lucas ve Grok ile tur tur konsey; ana cevap ve aksiyon özeti.',
    robots: { index: false, follow: false },
    openGraph: {
      title: `Grok Konseyi · ${seo.siteName}`,
      description:
        'Yönetim çoklu ajan konseyi — tartışma transkripti ve Grok ana cevabı.',
      siteName: seo.siteName,
      locale: ogLocale,
      type: 'website',
    },
  };
}

export default function AgentCouncilSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
