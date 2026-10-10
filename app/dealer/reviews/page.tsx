import { permanentRedirect } from 'next/navigation';
import { legacyInboxParams } from '@/lib/dealer-inbox/core';

/** Emekli: Tüketim yorumları → Gelen Kutusu, kaynak "Tüketim yorumu" (`?rating=` korunur). */
export default async function LegacyDealerReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = legacyInboxParams(await searchParams);
  if (!sp.has('source')) sp.set('source', 'consumption');
  permanentRedirect(`/dealer/inbox?${sp}`);
}
