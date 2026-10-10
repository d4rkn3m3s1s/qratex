import type { Metadata } from 'next';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { getServerLocale } from '@/lib/server-locale';
import { resolveWalletTabs } from '@/lib/wallet-card/tabs';
import { WalletShell } from '@/components/customer/m-cuzdan-kart/wallet-shell';

/**
 * CÜZDAN KABUĞU (yol haritası §4.3): Kartım · Ödüller · Ödüllerim · Hareketler · Bağış.
 *
 * Alt sekme sayfaları için sözleşme:
 *  - Kabuk sayfanın TEK `h1`'ini ("Cüzdan") ve sekme çubuğunu çizer. Alt sayfa kendi
 *    `h1`'ini çizmez; bölüm başlıkları `h2`'dir (ör. `SectionCard title`).
 *  - Alt sayfa kendi `<main>`'ini açmaz (müşteri layout'u açar) ve kenar boşluğu eklemez;
 *    kabuk içerik genişliğini (`max-w-3xl`, ortalı) belirler.
 *  - Sekme listesi `lib/navigation/registry.ts` (`customer.wallet` çocukları) + modül/menü
 *    görünürlüğünden türer; yeni sekme kayda eklenir, burada elle eklenmez.
 *  - Kayıt `ops` (cüzdan sakin): sonsuz döngü yok, iskelet statik.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: {
      default: locale === 'en' ? 'Wallet' : 'Cüzdan',
      template: `%s · ${locale === 'en' ? 'Wallet' : 'Cüzdan'}`,
    },
  };
}

export default async function CustomerWalletLayout({ children }: { children: React.ReactNode }) {
  const [shell, locale] = await Promise.all([getShellConfig('customer'), getServerLocale()]);
  return (
    <WalletShell tabs={resolveWalletTabs(shell)} locale={locale === 'en' ? 'en' : 'tr'}>
      {children}
    </WalletShell>
  );
}
