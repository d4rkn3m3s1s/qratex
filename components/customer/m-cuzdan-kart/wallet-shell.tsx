import type { ReactNode } from 'react';
import { Wallet } from 'lucide-react';
import { PageHeader } from '@/components/states';
import type { WalletTab } from '@/lib/wallet-card/tabs';
import { WalletTabs } from './wallet-tabs';

const COPY = {
  tr: {
    title: 'Cüzdan',
    description: 'Kartın, ödüllerin, hareketlerin ve bağışların tek yerde.',
    tabs: 'Cüzdan bölümleri',
  },
  en: {
    title: 'Wallet',
    description: 'Your card, rewards, activity and donations in one place.',
    tabs: 'Wallet sections',
  },
} as const;

/**
 * Cüzdan kabuğu (sunucu bileşeni): tek `h1` + rota tabanlı sekmeler + ortalı içerik.
 * Layout sekmeler arasında kalıcıdır; başlık ve sekmeler sekme değişiminde yeniden çizilmez.
 */
export function WalletShell({ tabs, locale, children }: { tabs: readonly WalletTab[]; locale: 'tr' | 'en'; children: ReactNode }) {
  const copy = COPY[locale];
  return (
    <div data-register="ops" className="mx-auto w-full max-w-3xl min-w-0 space-y-4 pb-6">
      <div className="space-y-3">
        <PageHeader title={copy.title} description={copy.description} icon={<Wallet />} />
        <WalletTabs tabs={tabs} ariaLabel={copy.tabs} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
