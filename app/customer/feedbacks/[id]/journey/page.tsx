import { permanentRedirect } from 'next/navigation';

/** Emekli: QR geri bildirim yolculuğu → Seslerim detay çekmecesi (`?id=fb-<id>`), sorgu parametreleri korunur. */
export default async function LegacyFeedbackJourneyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null && k !== 'id') sp.append(k, x);
  sp.set('id', `fb-${(await params).id}`);
  permanentRedirect(`/customer/me/voices?${sp}`);
}
