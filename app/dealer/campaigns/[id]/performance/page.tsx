import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { EmptyState, ErrorState, SkeletonDetail } from '@/components/states';
import { ApiError } from '@/lib/http/define-route';
import { getServerLocale } from '@/lib/server-locale';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { parseWindow } from '@/components/dealer/b-kampanyalar/domain';
import { getCampaignCopy, toCampaignLocale } from '@/components/dealer/b-kampanyalar/copy';
import { campaignKeys } from '@/components/dealer/b-kampanyalar/client/api';
import { firstParam, requireCampaignsPage } from '@/components/dealer/b-kampanyalar/server/page-auth';
import { campaignPerformance } from '@/components/dealer/b-kampanyalar/server/performance';
import { PerformanceScreen } from '@/components/dealer/b-kampanyalar/ui/performance-screen';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Sekme başlığı: "{kampanya} · Performans" (yalnız sahibi için; aksi hâlde genel başlık). */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const c = getCampaignCopy(toCampaignLocale(await getServerLocale()));
  try {
    const { id } = await params;
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return { title: c.perf.eyebrow, robots: { index: false } };
    const row = await prisma.campaign.findFirst({ where: { id, dealerId: auth.session.user.id }, select: { title: true } });
    return { title: row ? c.perf.metaTitle(row.title) : c.perf.eyebrow, robots: { index: false } };
  } catch {
    return { title: c.perf.eyebrow, robots: { index: false } };
  }
}

/**
 * /dealer/campaigns/[id]/performance — kampanya detayı ve gerçek huni (sunucu önce).
 * Seçili pencerenin ölçümü sunucuda hesaplanıp önbelleğe gömülür; pencere değişimi istemcide.
 */
export default async function CampaignPerformancePage({ params, searchParams }: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const locale = toCampaignLocale(await getServerLocale());
  const c = getCampaignCopy(locale);
  const dealerIdParam = firstParam(sp.dealerId);
  const auth = await requireCampaignsPage(`/dealer/campaigns/${encodeURIComponent(id)}/performance`, dealerIdParam);

  const header = <PageHeader eyebrow={c.perf.eyebrow} title={c.perf.eyebrow} back={{ href: '/dealer/campaigns', label: c.perf.back }} />;
  if (auth.kind !== 'ok') {
    return (
      <PanelPage register="ops" header={header}>
        {auth.kind === 'forbidden' ? (
          <EmptyState variant="permission" title={c.page.forbiddenTitle} description={c.page.forbiddenBody} />
        ) : auth.kind === 'disabled' ? (
          <EmptyState variant="permission" title={c.page.disabledTitle} description={c.page.disabledBody} />
        ) : (
          <ErrorState variant="section" title={c.page.unavailableTitle} description={c.page.unavailableBody} />
        )}
      </PanelPage>
    );
  }

  const win = parseWindow(firstParam(sp.window));
  const queryClient = new QueryClient();
  try {
    const perf = await campaignPerformance(auth.dealerId, id, win);
    queryClient.setQueryData(campaignKeys.performance(auth.dealerParam, id, win), perf);
  } catch (error) {
    // Yabancı ya da olmayan kampanya → 404 (varlık sızdırılmaz).
    if (error instanceof ApiError && error.code === 'NOT_FOUND') notFound();
    console.error('[campaign-performance] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense
        fallback={
          <PanelPage register="ops" header={header}>
            <SkeletonDetail />
          </PanelPage>
        }
      >
        <PerformanceScreen campaignId={id} dealerId={auth.dealerParam} readOnly={auth.readOnly} />
      </Suspense>
    </HydrationBoundary>
  );
}
