import type { Metadata } from 'next';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { getServerLocale } from '@/lib/server-locale';
import { resolveInboxTabs } from '@/lib/dealer-inbox/tabs';
import { InboxShell } from '@/components/dealer/b-gelen-kutusu/inbox-shell';

/**
 * GELEN KUTUSU KABUĞU (yol haritası §4.3, F3.2(b)): Tümü · Telafi onayı · Vakalar · Bana atananlar.
 *
 * Alt sekme sayfaları (`/dealer/inbox/{remedy,incidents,assigned}`) için sözleşme:
 *  - Kabuk sayfanın TEK `h1`'ini ("Gelen Kutusu") ve sekme çubuğunu çizer. Alt sayfa kendi
 *    `h1`'ini çizmez; bölüm başlıkları `h2`'dir (ör. `SectionCard title`).
 *  - Alt sayfa kendi `<main>`'ini açmaz (bayi layout'u açar) ve dış kenar boşluğu eklemez;
 *    kabuk içerik genişliğini (`max-w-7xl`, ortalı) belirler.
 *  - Sekme listesi `lib/navigation/registry.ts` (`dealer.inbox` çocukları) + modül/menü
 *    görünürlüğünden türer; yeni sekme kayda eklenir, burada elle eklenmez.
 *  - Kayıt `ops`: sonsuz döngü yok, iskelet statik.
 *  - Bir yorum/geri bildirime derin bağlantı: `/dealer/inbox?id=qr-<feedbackId>` ya da
 *    `/dealer/inbox?id=cr-<consumptionReviewId>` (detay çekmecesi açılır).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  const label = locale === 'en' ? 'Inbox' : 'Gelen Kutusu';
  return { title: { default: label, template: `%s · ${label}` } };
}

export default async function DealerInboxLayout({ children }: { children: React.ReactNode }) {
  const [shell, locale] = await Promise.all([
    getShellConfig('dealer').catch(() => null),
    getServerLocale().catch(() => 'tr' as const),
  ]);
  return (
    <InboxShell tabs={resolveInboxTabs(shell)} locale={locale === 'en' ? 'en' : 'tr'}>
      {children}
    </InboxShell>
  );
}
