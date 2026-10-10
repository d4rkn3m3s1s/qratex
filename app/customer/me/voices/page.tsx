import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { getServerLocale } from '@/lib/server-locale';
import { getVoiceSummary, listCustomerRemedies, listVoices } from '@/lib/customer-voices/server';
import {
  VOICE_PAGE_SIZE,
  normalizeVoiceQuery,
  normalizeVoiceStatusFilter,
  normalizeVoiceTypeFilter,
} from '@/lib/customer-voices/core';
import { SkeletonList } from '@/components/states';
import { VoicesScreen, type VoicesInitial } from '@/components/customer/m-seslerim/voices-screen';

/**
 * Seslerim — Ben → Seslerim (yol haritası §4.3, F3.1(e)).
 *
 * Birleşen eski rotalar (hepsi buraya kalıcı yönlendirir): /customer/feedbacks,
 * /customer/feedbacks/[id]/journey (→ ?id=fb-…), /customer/consumptions/[id] (→ ?id=cs-…),
 * /customer/remedy, /customer/remedy/[offerId] (→ ?offer=…), /customer/ai-insights ("Sesin" kartı).
 *
 * Sunucu önce: özet, ilk liste sayfası ve telafiler sunucuda paralel çekilir ve istemci
 * adasına `initialData` olarak verilir (ilk boyamada istek yok). Bir kaynak düşerse diğerleri
 * yine gelir; düşen kaynak istemcide görünür hata + "Tekrar dene" ile gösterilir.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'My voice', description: 'Your feedback, purchase reviews, business replies and remedies.', robots: { index: false } }
    : { title: 'Seslerim', description: 'Geri bildirimlerin, tüketim yorumların, işletme yanıtları ve telafilerin.', robots: { index: false } };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[voices] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function VoicesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = {
    type: normalizeVoiceTypeFilter(first(sp.type)),
    status: normalizeVoiceStatusFilter(first(sp.status)),
    q: normalizeVoiceQuery(first(sp.q)),
  };

  // Rol proxy'de korunur; yetki kararı yine DB'den (oturum iptali, rol değişimi).
  const auth = await requireAuth(['CUSTOMER']);
  const userId = 'error' in auth ? null : auth.session.user.id;

  const [summary, list, remedies] = userId
    ? await Promise.all([
        settle(getVoiceSummary(userId)),
        settle(listVoices(userId, { ...filters, cursor: null, limit: VOICE_PAGE_SIZE })),
        settle(listCustomerRemedies(userId)),
      ])
    : [null, null, null];

  const initial: VoicesInitial = {
    filters,
    summary,
    list,
    remedies: remedies ? { offers: remedies.items, hasMore: remedies.hasMore } : null,
  };

  return (
    <Suspense fallback={<SkeletonList rows={6} />}>
      <VoicesScreen initial={initial} />
    </Suspense>
  );
}
