import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';
import { getRemedyCounts, listRemedyOffers } from '@/lib/dealer-queues/remedy-server';
import { normalizeRemedySource, normalizeRemedyView, normalizeSearch } from '@/lib/dealer-queues/remedy-core';
import { SkeletonList } from '@/components/states';
import { firstParam, gateQueuePage, settle } from '@/components/dealer/b-gelen-kuyruklar/shared/page-gate';
import { RemedyScreen, type RemedyInitial } from '@/components/dealer/b-gelen-kuyruklar/remedy/remedy-screen';

/**
 * Gelen Kutusu → Telafi onayı (yol haritası §4.3, F3.2(b)). Eski `/dealer/remedy-queue` buraya
 * kalıcı yönlenir. Sunucu önce: ilk sayfa + sayaçlar paralel çekilir; istemci adası küçük.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Remedy approvals', description: 'Review, edit and publish remedies before customers see them.', robots: { index: false } }
    : { title: 'Telafi onayı', description: 'Telafi tekliflerini müşteri görmeden önce incele, düzenle ve yayınla.', robots: { index: false } };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RemedyApprovalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const gate = await gateQueuePage('remedy_offers', sp);
  if (!gate.ok) return gate.node;

  const view = normalizeRemedyView(firstParam(sp.view));
  const source = normalizeRemedySource(firstParam(sp.source));
  const q = normalizeSearch(firstParam(sp.q));
  const dealerId = gate.scope.dealerId;

  const [page, counts] = await Promise.all([
    settle('remedy-list', listRemedyOffers(dealerId, { view, source, q, cursor: null })),
    settle('remedy-counts', getRemedyCounts(dealerId)),
  ]);

  const initial: RemedyInitial = {
    view,
    source,
    q,
    list: page && counts ? { ...page, counts } : null,
    readOnly: gate.readOnly,
  };

  return (
    <Suspense fallback={<SkeletonList rows={5} />}>
      <RemedyScreen initial={initial} />
    </Suspense>
  );
}
