import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getServerLocale } from '@/lib/server-locale';
import { isCustomerModuleBlocked } from '@/lib/customer-wallet/gate';
import { getPointsHistory, getPointsOverview } from '@/lib/customer-wallet/activity/points-history';
import { getPendingShelf, getReviewRewardPreview, getVisitStats, getVisitsPage } from '@/lib/customer-wallet/activity/visits';
import { getSpendSummary } from '@/lib/customer-wallet/activity/spend-summary';
import { ActivityView, type ActivityInitial } from '@/components/customer/m-cuzdan-hareketler/activity-view';
import {
  getterFrom,
  readActivityTab,
  readPointsFilter,
  readRange,
  readVisitsFilter,
} from '@/components/customer/m-cuzdan-hareketler/filters';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: locale === 'en' ? 'Activity' : 'Hareketler',
    description:
      locale === 'en'
        ? 'Your points ledger, visits and spending summary.'
        : 'Puan defterin, ziyaretlerin ve harcama özetin.',
  };
}

/**
 * Cüzdan → Hareketler (yol haritası §4.3): puan defteri + ziyaretler (eski /customer/consumptions)
 * + harcama özeti (eski /customer/spending-overview).
 *
 * Sunucu önce: açılan sekmenin ilk sayfası burada (DB'den, API ile AYNI servislerle) hazırlanır
 * ve istemci sorgusunun başlangıç verisi olur → soğuk açılışta ek istek yok. DB hatası sayfayı
 * düşürmez: başlangıç verisi boş kalır, istemci kendi isteğini atar ve hata varsa QueryState
 * "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 */
export default async function WalletActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    redirect('/auth/login?callbackUrl=%2Fcustomer%2Fwallet%2Factivity');
  }
  const userId = session.user.id;
  const get = getterFrom(await searchParams);

  const summaryEnabled = !(await isCustomerModuleBlocked('spending_overview', null, {
    userId,
    routeKey: '/customer/wallet/activity',
  }));
  const tab = readActivityTab(get, summaryEnabled);
  const initial: ActivityInitial = {};

  const [pendingCount] = await Promise.all([
    prisma.consumption.count({ where: { customerId: userId, review: null } }).catch(() => null),
    (async () => {
      try {
        if (tab === 'points') {
          const filter = readPointsFilter(get);
          const [page, overview] = await Promise.all([
            getPointsHistory(prisma, userId, { direction: filter.dir, group: filter.group }),
            getPointsOverview(prisma, userId),
          ]);
          initial.points = { filter, page: { ...page, overview } };
        } else if (tab === 'visits') {
          const filter = readVisitsFilter(get);
          const [page, stats, reward, pendingShelf] = await Promise.all([
            getVisitsPage(prisma, userId, { review: filter.review, q: filter.q || null, dealerId: filter.dealer }),
            getVisitStats(prisma, userId),
            getReviewRewardPreview(prisma, userId),
            getPendingShelf(prisma, userId),
          ]);
          initial.visits = { filter, page: { ...page, review: filter.review, stats, reward, pendingShelf } };
        } else {
          const range = readRange(get);
          initial.summary = { range, data: await getSpendSummary(prisma, userId, range) };
        }
      } catch (error) {
        // İstemci kendi isteğiyle yeniden dener ve gerekirse hata durumunu gösterir.
        console.error('[wallet/activity] ön yükleme başarısız', error);
      }
    })(),
  ]);

  return <ActivityView initial={initial} summaryEnabled={summaryEnabled} pendingCount={pendingCount} />;
}
