import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { ErrorState } from '@/components/states';
import { loadCommandHealth, loadCommandOverview } from '@/lib/admin-command/server';
import { COMMAND_QUERY_KEYS, DEFAULT_COMMAND_RANGE, isCommandRange } from '@/lib/admin-command/types';
import { CommandScreen } from '@/components/admin/a-komuta/command-screen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Komuta Merkezi',
  description: 'Platform sağlığı, kuyruklar, nabız ve son olaylar tek ekranda.',
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Admin › Komuta Merkezi (`/admin`). Eski `/admin/platform-pulse` ve `/admin/ecosystem`
 * buraya yönlenir. Sunucu önce: yetki DB'den (`requireAuth` + yönetici kapısı), genel bakış
 * ve sağlık BFF ile AYNI yükleyicilerden React Query önbelleğine gömülür → açılışta istemci
 * isteği ve çift iskelet yok. Sunucu yüklemesi düşerse önbellek boş kalır; istemci adası
 * BFF'i çağırır ve hatayı "Tekrar dene" ile gösterir (sıfırlar veri gibi gösterilmez).
 */
export default async function AdminCommandCenterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, auth] = await Promise.all([searchParams, requireAuth(['ADMIN'])]);
  if ('error' in auth) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" variant="page" />
      </div>
    );
  }
  const raw = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = isCommandRange(raw) ? raw : DEFAULT_COMMAND_RANGE;

  const qc = new QueryClient();
  const [overview, health] = await Promise.allSettled([loadCommandOverview(range), loadCommandHealth()]);
  if (overview.status === 'fulfilled') qc.setQueryData(COMMAND_QUERY_KEYS.overview(range), overview.value);
  else console.error('[admin/komuta] genel bakış SSR yüklemesi başarısız; istemci yeniden deneyecek', overview.reason);
  if (health.status === 'fulfilled') qc.setQueryData(COMMAND_QUERY_KEYS.health, { ...health.value.data, generatedAt: health.value.generatedAt });
  else console.error('[admin/komuta] sağlık SSR yüklemesi başarısız; istemci yeniden deneyecek', health.reason);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CommandScreen initialRange={range} />
    </HydrationBoundary>
  );
}
