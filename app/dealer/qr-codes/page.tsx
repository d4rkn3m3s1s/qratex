import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { loadLocations, loadQrList, loadQrSummary } from '@/lib/dealer/qr-codes/load.server';
import { normalizeQrFilters } from '@/lib/dealer/qr-codes/rules';
import { QR_LOCATIONS_KEY, QR_SUMMARY_KEY, qrListKey } from '@/lib/dealer/qr-codes/types';
import { QrScreen } from '@/components/dealer/b-qr-kodlar/qr-screen';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Bayi › QR kodlar ve şubeler. Sunucu önce: kimlik/rol DB'den (`requireAuth`), özet + ilk liste
 * + şubeler BFF ile AYNI yükleyicilerden gelir ve React Query önbelleğine gömülür → açılışta
 * istemci isteği yok. Bir yükleme düşerse o önbellek boş kalır; istemci adası BFF'i çağırır ve
 * hatayı görünür (tekrar dene) gösterir. `?search=` (global arama derin linki) `q`'ya eşlenir.
 */
export default async function DealerQrCodesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, auth] = await Promise.all([searchParams, requireAuth(['DEALER'])]);
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string') flat[k] = s;
  }
  const filters = normalizeQrFilters(flat);
  const queryClient = new QueryClient();
  if (!('error' in auth)) {
    const dealerId = auth.session.user.id;
    const [summary, list, locations] = await Promise.allSettled([
      loadQrSummary(dealerId),
      loadQrList(dealerId, filters),
      loadLocations(dealerId),
    ]);
    if (summary.status === 'fulfilled') queryClient.setQueryData(QR_SUMMARY_KEY, summary.value);
    if (list.status === 'fulfilled') queryClient.setQueryData(qrListKey(filters), list.value);
    if (locations.status === 'fulfilled') queryClient.setQueryData(QR_LOCATIONS_KEY, locations.value);
    for (const r of [summary, list, locations]) {
      if (r.status === 'rejected') console.error('[dealer-qr-codes] SSR yüklemesi başarısız; istemci yeniden deneyecek', r.reason);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <QrScreen />
    </HydrationBoundary>
  );
}
