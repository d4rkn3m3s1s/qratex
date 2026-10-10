/**
 * /customer/wallet/rewards — Cüzdan → Ödüller (eski /customer/rewards + /customer/shop kozmetik).
 *
 * Sunucu önce: bakiye, müşteri DTO'lu katalog (durum: alınabilir / puan eksik / tükendi /
 * yakında / süresi doldu / limit) ve kozmetikler ilk render'da gelir — "0 puan" parlaması ve
 * açılışta 6 istek yok. Yükleme hatası boş katalog gibi GÖRÜNMEZ (hata + tekrar dene);
 * modül kapalıysa ayrı durum. Sekme/filtre/detay URL'de (`?tab=cosmetics`, `?reward=<id>`,
 * `?item=<id>`), istemci adası sunucuya gitmeden günceller.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { isCustomerModuleBlocked } from '@/lib/customer-wallet/gate';
import { loadCosmeticsCatalog, loadRewardsCatalog } from '@/lib/wallet-rewards/queries';
import type { CosmeticsCatalogDTO, RewardsCatalogDTO } from '@/lib/wallet-rewards/types';
import { prisma } from '@/lib/prisma';
import { RewardsView, type LoadIssue } from '@/components/customer/m-cuzdan-oduller/rewards-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return locale === 'en'
    ? { title: 'Rewards', description: 'Turn your points into rewards and profile cosmetics.' }
    : { title: 'Ödüller', description: 'Puanını ödüllere ve profil kozmetiklerine dönüştür.' };
}

export default async function WalletRewardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Eski `/customer/rewards?tab=myRewards` bağlantıları (next.config yönlendirmesi sorguyu korur).
  if ((await searchParams).tab === 'myRewards') redirect('/customer/wallet/owned');
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    redirect('/auth/login?callbackUrl=%2Fcustomer%2Fwallet%2Frewards');
  }
  const userId = session.user.id;

  const rewardsBlocked = await isCustomerModuleBlocked('rewards', null, { userId, routeKey: '/customer/wallet/rewards' });

  const [rewardsResult, cosmeticsResult] = await Promise.allSettled([
    rewardsBlocked ? Promise.resolve(null) : loadRewardsCatalog(userId),
    loadCosmeticsCatalog(userId),
  ]);

  let rewards: RewardsCatalogDTO | null = null;
  let rewardsIssue: LoadIssue = null;
  if (rewardsBlocked) rewardsIssue = 'moduleDisabled';
  else if (rewardsResult.status === 'fulfilled') rewards = rewardsResult.value;
  else {
    rewardsIssue = 'error';
    console.error('[wallet/rewards] katalog yüklenemedi', rewardsResult.reason);
  }

  let cosmetics: CosmeticsCatalogDTO | null = null;
  let cosmeticsIssue: LoadIssue = null;
  if (cosmeticsResult.status === 'fulfilled') cosmetics = cosmeticsResult.value;
  else {
    cosmeticsIssue = 'error';
    console.error('[wallet/rewards] kozmetikler yüklenemedi', cosmeticsResult.reason);
  }

  // Bakiye katalogla birlikte gelir; katalog kapalı/hatalıysa ayrıca okunur (hero için).
  // Okunamazsa null: hero gizlenir, sahte "0 puan" gösterilmez.
  let balance: number | null = rewards?.balance ?? null;
  if (balance === null) {
    try {
      balance = (await prisma.user.findUnique({ where: { id: userId }, select: { points: true } }))?.points ?? null;
    } catch {
      balance = null;
    }
  }

  return (
    <Suspense>
      <RewardsView
        balance={balance}
        rewards={rewards}
        rewardsIssue={rewardsIssue}
        cosmetics={cosmetics}
        cosmeticsIssue={cosmeticsIssue}
      />
    </Suspense>
  );
}
