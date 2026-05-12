import type { Metadata } from 'next';
import { cache } from 'react';
import { getSeoSettings } from '@/lib/seo-settings';

const getSeoSettingsOnce = cache(getSeoSettings);

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettingsOnce();
  const ogLocale = seo.locale.replace('_', '-');
  return {
    title: 'Konsey geçmişi',
    description:
      'Kayıtlı çoklu ajan koşuları; geçmiş tartışmaları ve kararları yeniden açın.',
    robots: { index: false, follow: false },
    openGraph: {
      title: `Konsey geçmişi · ${seo.siteName}`,
      description: 'Yönetim konsey oturum geçmişi ve kayıtlı koşular.',
      siteName: seo.siteName,
      locale: ogLocale,
      type: 'website',
    },
  };
}

export default function AgentCouncilHistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
