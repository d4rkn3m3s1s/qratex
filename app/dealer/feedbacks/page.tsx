import { permanentRedirect } from 'next/navigation';
import { legacyInboxParams } from '@/lib/dealer-inbox/core';

/** Emekli: Geri bildirimler → Gelen Kutusu (`?tab=qr` → `?source=qr`, `?search=` → `?q=`; diğer parametreler korunur). */
export default async function LegacyDealerFeedbacksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = legacyInboxParams(await searchParams);
  permanentRedirect(`/dealer/inbox${sp.size ? `?${sp}` : ''}`);
}
