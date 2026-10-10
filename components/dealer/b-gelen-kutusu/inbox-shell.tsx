import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { PageHeader } from '@/components/states';
import type { InboxTab } from '@/lib/dealer-inbox/tabs';
import { InboxTabs } from './inbox-tabs';

const COPY = {
  tr: {
    title: 'Gelen Kutusu',
    description: 'QR geri bildirimleri ve tüketim yorumları tek yerde: yanıtla, telafi et, ata, kapat.',
    tabs: 'Gelen kutusu bölümleri',
  },
  en: {
    title: 'Inbox',
    description: 'QR feedback and purchase reviews in one place: reply, remedy, assign, resolve.',
    tabs: 'Inbox sections',
  },
} as const;

/**
 * Gelen Kutusu kabuğu (sunucu bileşeni): sayfanın TEK `h1`'i + rota tabanlı sekmeler.
 * Layout sekmeler arasında kalıcıdır; başlık ve sekmeler sekme değişiminde yeniden çizilmez.
 * Kayıt `ops` (sakin operasyon yüzeyi): sonsuz döngü yok, iskelet statik.
 */
export function InboxShell({ tabs, locale, children }: { tabs: readonly InboxTab[]; locale: 'tr' | 'en'; children: ReactNode }) {
  const copy = COPY[locale];
  return (
    <div data-register="ops" className="mx-auto w-full max-w-7xl min-w-0 space-y-4 pb-6">
      <div className="space-y-3">
        <PageHeader title={copy.title} description={copy.description} icon={<Inbox />} />
        <InboxTabs tabs={tabs} ariaLabel={copy.tabs} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
