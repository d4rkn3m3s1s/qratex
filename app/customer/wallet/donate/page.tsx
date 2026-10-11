import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getServerLocale } from '@/lib/server-locale';
import { isCustomerModuleBlocked } from '@/lib/customer-wallet/gate';
import { getDonateOverview, type DonateOverview } from '@/lib/customer-wallet/donate/service';
import { DonateView } from '@/components/customer/m-cuzdan-hareketler/donate-view';
import { DonateModuleOff } from '@/components/customer/m-cuzdan-hareketler/donate-module-off';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: locale === 'en' ? 'Donate' : 'Bağış',
    description:
      locale === 'en' ? 'Turn your points into social impact projects.' : 'Puanlarını sosyal sorumluluk projelerine dönüştür.',
  };
}

/**
 * Cüzdan → Bağış (yol haritası §4.3; eski /customer/donations).
 * Modül kapısı sayfa düzeyinde de uygulanır: kapalıysa istemci gövdesi yüklenmez, dürüst
 * "kapalı" ekranı ve kişinin kendi bağış geçmişi gösterilir (denetim B2: "Henüz proje yok" yalanı yok).
 * Katalog + kişisel etki sunucuda hazırlanır (ilk boyamada istek yok); DB hatasında istemci
 * kendi isteğiyle yeniden dener ve hata ekranı gösterir.
 */
export default async function WalletDonatePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    redirect('/auth/login?callbackUrl=%2Fcustomer%2Fwallet%2Fdonate');
  }
  const userId = session.user.id;
  const blocked = await isCustomerModuleBlocked('donations', 'donations', { userId, routeKey: '/customer/wallet/donate' });
  if (blocked) return <DonateModuleOff />;

  let initial: DonateOverview | null = null;
  try {
    initial = await getDonateOverview(prisma, userId);
  } catch (error) {
    console.error('[wallet/donate] ön yükleme başarısız', error);
  }
  return <DonateView initial={initial} />;
}
