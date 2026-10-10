import { permanentRedirect } from 'next/navigation';

/** Emekli: telafi detayı → Seslerim telafi çekmecesi (`?offer=<id>`), sorgu parametreleri korunur. */
export default async function LegacyRemedyOfferPage({ params, searchParams }: { params: Promise<{ offerId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null && k !== 'offer') sp.append(k, x);
  sp.set('offer', (await params).offerId);
  permanentRedirect(`/customer/me/voices?${sp}`);
}
