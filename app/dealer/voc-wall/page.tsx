import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope } from '@/lib/auth/scope';
import { EmptyState, ErrorState } from '@/components/states';
import { WALL_RANGES, type WallRange } from '@/lib/dealer/voc-wall/config';
import { getWallConfig, loadCurationPage, loadWallFeed, loadWallOverview } from '@/lib/dealer/voc-wall/server';
import { curationKey, overviewKey, previewKey } from '@/components/dealer/b-voc-duvari/keys';
import { VocWallScreen } from '@/components/dealer/b-voc-duvari/voc-wall-screen';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Bayi › Müşteri sesi duvarı. Sunucu önce: yetki ve kiracı DB'den (`requireAuth` +
 * `resolveDealerScope`; STAFF aktif bağı, ADMIN `?dealerId=` ile salt-okunur), modül kapısı,
 * ardından özet + ilk yayın listesi + ekran önizlemesi BFF ile AYNI yükleyicilerden React Query
 * önbelleğine gömülür. Bir yükleme düşerse istemci adası kendi sorgusunda hata + "Tekrar dene" gösterir.
 */
export default async function DealerVocWallPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, auth] = await Promise.all([searchParams, requireAuth(['DEALER', 'STAFF', 'ADMIN'])]);
  if ('error' in auth) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" />
      </div>
    );
  }
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const scope = await resolveDealerScope(auth.session, { dealerId: first(sp.dealerId) ?? null });
  if (!scope.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" description={scope.message} />
      </div>
    );
  }

  try {
    const { assertModuleEnabled } = await import('@/lib/module-gate');
    if (await assertModuleEnabled('voc_wall', { userId: auth.session.user.id, routeKey: 'page:/dealer/voc-wall' })) {
      return (
        <div className="mx-auto w-full max-w-3xl">
          <EmptyState
            variant="permission"
            title="Müşteri sesi duvarı kapalı"
            description="Bu modül yönetici tarafından geçici olarak devre dışı bırakıldı."
          />
        </div>
      );
    }
  } catch (err) {
    console.error('[dealer/voc-wall] modül kapısı okunamadı', err);
  }

  const rawRange = Number(first(sp.range));
  const range: WallRange = (WALL_RANGES as readonly number[]).includes(rawRange) ? (rawRange as WallRange) : 30;
  const dealerId = scope.dealerId;
  const qc = new QueryClient();
  const [overview, curation, preview] = await Promise.allSettled([
    loadWallOverview(dealerId, { range, qrCodeId: null }),
    loadCurationPage(dealerId, { filter: 'all', page: 1, qrCodeId: null }),
    getWallConfig(dealerId).then((cfg) => loadWallFeed(dealerId, cfg, null)),
  ]);
  if (overview.status === 'fulfilled') qc.setQueryData(overviewKey(range, null), overview.value);
  if (curation.status === 'fulfilled') qc.setQueryData(curationKey('all', 1, null), curation.value);
  if (preview.status === 'fulfilled') qc.setQueryData(previewKey, preview.value);
  for (const r of [overview, curation, preview]) {
    if (r.status === 'rejected') console.error('[dealer/voc-wall] SSR yüklemesi başarısız; istemci yeniden deneyecek', r.reason);
  }

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <VocWallScreen role={scope.actorRole} actAsDealerId={scope.via === 'admin' ? dealerId : null} initialRange={range} />
    </HydrationBoundary>
  );
}
