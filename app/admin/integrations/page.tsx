import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { KeyListQuery, PartnerListQuery, WebhookListQuery } from '@/lib/integrations/contract';
import { getOverview, listKeys, listPartners, listWebhooks } from '@/lib/integrations/server';
import { IntegrationsCenter, type IntegrationsInitial } from '@/components/admin/a-entegrasyonlar/integrations-center';
import { keyQs, partnerQs, webhookQs } from '@/components/admin/a-entegrasyonlar/qs';

/**
 * Admin → Entegrasyonlar (/admin/integrations). Eski /admin/api-keys, /admin/partners,
 * /admin/webhooks, /admin/api-catalog ve /admin/tech/add buraya kalıcı yönlenir.
 *
 * Sunucu önce: KPI'lar ve URL'deki aktif sekmenin ilk verisi sunucuda okunur; istemci adası
 * `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entegrasyonlar',
  description: 'API anahtarları, webhook aboneliği ve teslim günlüğü, partnerler, admin API kataloğu ve partner dokümantasyonu.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/integrations] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminIntegrationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat: Record<string, string> = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const get = (k: string) => flat[k] || null;
  const tab = flat.tab || 'anahtarlar';

  const initial: IntegrationsInitial = { overview: null, keys: null, webhooks: null, partners: null };
  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    const kqs = keyQs(get);
    const wqs = webhookQs(get);
    const pqs = partnerQs(get);
    const kp = KeyListQuery.safeParse(Object.fromEntries(new URLSearchParams(kqs)));
    const wp = WebhookListQuery.safeParse(Object.fromEntries(new URLSearchParams(wqs)));
    const pp = PartnerListQuery.safeParse(Object.fromEntries(new URLSearchParams(pqs)));
    const [overview, keys, webhooks, partners] = await Promise.all([
      settle(getOverview()),
      tab === 'anahtarlar' && kp.success ? settle(listKeys(kp.data)) : Promise.resolve(null),
      tab === 'webhooklar' && wp.success ? settle(listWebhooks(wp.data)) : Promise.resolve(null),
      tab === 'partnerler' && pp.success ? settle(listPartners(pp.data)) : Promise.resolve(null),
    ]);
    initial.overview = overview;
    if (keys) initial.keys = { qs: kqs, page: keys };
    if (webhooks) initial.webhooks = { qs: wqs, items: webhooks };
    if (partners) initial.partners = { qs: pqs, items: partners };
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
      <IntegrationsCenter initial={initial} />
    </Suspense>
  );
}
