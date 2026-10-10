/**
 * /customer/wallet/card — Cüzdan → Kartım (eski /customer/my-card + /customer/lounge statüsü).
 * Sunucu bileşeni: kartlar, statü, doğum günü anı, bekleyen yorumlar ve son işlemler ilk
 * render'da gelir (tek yükleyici `lib/wallet-card/load.ts`); etkileşim küçük istemci adasında.
 *
 * Derin link: `?present=1` → "Kasada göster" tam ekranı doğrudan açılır (⌘K kısayolu).
 * Sunucu yüklemesi düşerse ada BFF'ten yeniden dener; o da düşerse hata + yeniden dene ya da
 * son kaydedilen kart (çevrimdışı) gösterilir — asla sessizce "kartın yok" değil.
 */
import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { loadWalletCard } from '@/lib/wallet-card/load';
import type { WalletCardPayload } from '@/lib/wallet-card/dto';
import { WalletCardView } from '@/components/customer/m-cuzdan-kart/wallet-card-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return locale === 'en'
    ? { title: 'My card', description: 'Show your QR code at the counter, see your status and recent activity.' }
    : { title: 'Kartım', description: 'Kasada QR kodunu göster; statünü ve son işlemlerini gör.' };
}

export default async function WalletCardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    redirect('/auth/login?callbackUrl=%2Fcustomer%2Fwallet%2Fcard');
  }
  const locale = (await getServerLocale()) === 'en' ? 'en' : 'tr';

  let initialData: WalletCardPayload | null = null;
  try {
    initialData = await loadWalletCard(session.user.id);
  } catch (error) {
    // İstemci adası BFF'ten tekrar dener; hata görünür kalır (boş durum gösterilmez).
    console.error('[wallet/card] ilk yükleme başarısız', error);
  }

  return (
    <>
      <h2 className="sr-only">{locale === 'en' ? 'My card' : 'Kartım'}</h2>
      <WalletCardView initialData={initialData} userId={session.user.id} locale={locale} />
    </>
  );
}
