import { Suspense } from 'react';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { EmptyState, ErrorState, SkeletonList, SkeletonStats } from '@/components/states';
import { getServerLocale } from '@/lib/server-locale';
import {
  MESSAGE_MAX,
  TITLE_MAX,
  isCampaignSegment,
  normalizeSegment,
  parseListTab,
  type CampaignSegmentKey,
} from '@/components/dealer/b-kampanyalar/domain';
import { getCampaignCopy, toCampaignLocale } from '@/components/dealer/b-kampanyalar/copy';
import { campaignKeys } from '@/components/dealer/b-kampanyalar/client/api';
import { firstParam, requireCampaignsPage } from '@/components/dealer/b-kampanyalar/server/page-auth';
import { campaignSummary, listCampaigns } from '@/components/dealer/b-kampanyalar/server/list';
import { CampaignsScreen } from '@/components/dealer/b-kampanyalar/ui/campaigns-screen';
import type { PrefillDraft } from '@/components/dealer/b-kampanyalar/types';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * /dealer/campaigns — kampanya merkezi (sunucu önce).
 * Kimlik + kiracı + modül kapısı sunucuda; ilk liste ve 30 günlük özet AYNI yükleyicilerle
 * (BFF uçlarıyla ortak) okunup React Query önbelleğine gömülür → açılışta istek yok.
 * Yükleme başarısızsa önbellek boş kalır; istemci adası hatayı görünür gösterir (tekrar dene).
 */
export default async function DealerCampaignsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const locale = toCampaignLocale(await getServerLocale());
  const c = getCampaignCopy(locale);
  const dealerIdParam = firstParam(sp.dealerId);
  const auth = await requireCampaignsPage(
    `/dealer/campaigns${dealerIdParam ? `?dealerId=${encodeURIComponent(dealerIdParam)}` : ''}`,
    dealerIdParam
  );

  const header = <PageHeader eyebrow={c.page.eyebrow} title={c.page.title} description={c.page.description} />;
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

  const prefill = parsePrefill(sp, c.sources);
  const tab = parseListTab(firstParam(sp.tab));
  const q = firstParam(sp.q) ?? '';
  const segParam = firstParam(sp.segment);
  const segment: CampaignSegmentKey | null = !prefill && isCampaignSegment(segParam) ? segParam : null;
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);

  const queryClient = new QueryClient();
  try {
    const [list, summary] = await Promise.all([
      listCampaigns(auth.dealerId, { tab, q, segment, page }),
      campaignSummary(auth.dealerId),
    ]);
    queryClient.setQueryData(campaignKeys.list(auth.dealerParam, { tab, q, segment, page }), list);
    queryClient.setQueryData(campaignKeys.summary(auth.dealerParam), summary);
  } catch (error) {
    console.error('[campaigns] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense
        fallback={
          <PanelPage register="ops" header={header}>
            <SkeletonStats />
            <SkeletonList rows={4} />
          </PanelPage>
        }
      >
        <CampaignsScreen dealerId={auth.dealerParam} readOnly={auth.readOnly} prefill={prefill} />
      </Suspense>
    </HydrationBoundary>
  );
}

/**
 * Ön-dolu editör derin bağlantısı (denetim: churn-risk "Kampanya oluştur" bayiyi boş forma
 * düşürüyordu): `?new=1&segment=risk&title=…&message=…&source=churn-risk`.
 */
function parsePrefill(sp: Record<string, string | string[] | undefined>, sources: Record<string, string>): PrefillDraft | null {
  if (firstParam(sp.new) !== '1') return null;
  const sourceKey = firstParam(sp.source);
  return {
    open: true,
    segment: normalizeSegment(firstParam(sp.segment)),
    title: (firstParam(sp.title) ?? '').slice(0, TITLE_MAX),
    message: (firstParam(sp.message) ?? '').slice(0, MESSAGE_MAX),
    source: sourceKey && Object.prototype.hasOwnProperty.call(sources, sourceKey) ? sources[sourceKey] : null,
  };
}
