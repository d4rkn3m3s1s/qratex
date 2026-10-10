import { permanentRedirect } from 'next/navigation';

/** Emekli: Telafi listesi → Seslerim (bekleyenler aksiyon bandında; `?offerId=`/`?id=` → `?offer=` çekmecesi). */
export default async function LegacyRemedyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) sp.append(k === 'offerId' || k === 'id' ? 'offer' : k, x);
  permanentRedirect(`/customer/me/voices${sp.size ? `?${sp}` : ''}`);
}
