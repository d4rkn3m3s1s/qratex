/**
 * /customer/wallet/owned — Cüzdan → Ödüllerim (eski /customer/surprise-boxes + ödül kodları +
 * kabul edilmiş telafi kuponları).
 *
 * Sunucu önce ve YAN ETKİSİZ: kodlar, telafi kuponları, bekleyen kutular (içerik gizli —
 * yalnız kademe/kaynak), açılan kutular (ilk sayfa) ve bugünün kutusunun durumu ilk render'da.
 * Günlük kutu bu sayfa açıldı diye üretilmez; müşteri "Aç" dediğinde POST ile oluşur.
 * Derin linkler: `?pass=reward:<id>` (bildirimden kod), `?pass=remedy:<id>`, `?pass=box:<id>`,
 * `?tab=boxes`.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { isCustomerModuleBlocked } from '@/lib/customer-wallet/gate';
import { loadOwnedWallet } from '@/lib/wallet-rewards/queries';
import type { OwnedWalletDTO } from '@/lib/wallet-rewards/types';
import { OwnedView } from '@/components/customer/m-cuzdan-oduller/owned-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return locale === 'en'
    ? { title: 'My rewards', description: 'Your reward codes, remedy coupons and surprise boxes.' }
    : { title: 'Ödüllerim', description: 'Ödül kodların, telafi kuponların ve sürpriz kutuların.' };
}

export default async function WalletOwnedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    redirect('/auth/login?callbackUrl=%2Fcustomer%2Fwallet%2Fowned');
  }
  const userId = session.user.id;

  const boxesBlocked = await isCustomerModuleBlocked('surprise_boxes', null, { userId, routeKey: '/customer/wallet/owned' });
  let data: OwnedWalletDTO | null = null;
  try {
    data = await loadOwnedWallet(userId, { boxesEnabled: !boxesBlocked });
  } catch (error) {
    // Hata boş cüzdan gibi görünmez: istemci "Tekrar dene" gösterir.
    console.error('[wallet/owned] yüklenemedi', error);
  }

  return (
    <Suspense>
      <OwnedView data={data} />
    </Suspense>
  );
}
