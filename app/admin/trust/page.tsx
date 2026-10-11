import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { AlertListQuery, CaseListQuery, alertQsFromParams, caseQsFromParams } from '@/lib/admin-trust/contract';
import { getOverview, listAlerts, listCases } from '@/lib/admin-trust/trust.server';
import { TrustCenter, type TrustInitial } from '@/components/admin/a-guven-merkezi/trust-center';

/**
 * Admin → Güven Merkezi (/admin/trust). Eski /admin/trust-command ve /admin/fraud-prevention
 * buraya kalıcı yönlenir.
 *
 * Sunucu önce: KPI'lar ve URL'deki aktif sekmenin ilk sayfası sunucuda okunur; istemci adası
 * `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Güven Merkezi',
  description: 'Sahtekârlık vaka kuyruğu, güvenlik uyarıları, tespit kuralları ve hassas yönetici işlemleri.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/trust] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminTrustPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat: Record<string, string> = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const get = (k: string) => flat[k] || null;
  const tab = flat.tab || 'vakalar';

  const initial: TrustInitial = { overview: null, cases: null, alerts: null };
  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    const caseQs = caseQsFromParams(get);
    const alertQs = alertQsFromParams(get);
    const caseParams = CaseListQuery.safeParse(Object.fromEntries(new URLSearchParams(caseQs)));
    const alertParams = AlertListQuery.safeParse(Object.fromEntries(new URLSearchParams(alertQs)));
    const [overview, cases, alerts] = await Promise.all([
      settle(getOverview()),
      tab === 'vakalar' && caseParams.success ? settle(listCases(caseParams.data)) : Promise.resolve(null),
      tab === 'uyarilar' && alertParams.success ? settle(listAlerts(alertParams.data)) : Promise.resolve(null),
    ]);
    initial.overview = overview;
    if (cases) initial.cases = { qs: caseQs, page: cases };
    if (alerts) initial.alerts = { qs: alertQs, page: alerts };
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <TrustCenter initial={initial} />
    </Suspense>
  );
}
