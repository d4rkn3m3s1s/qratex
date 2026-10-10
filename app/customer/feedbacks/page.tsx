import { permanentRedirect } from 'next/navigation';

/** Emekli: Geri bildirimlerim → Ben › Seslerim (eski `?search=` → `?q=`, `?tab=qr` → `?type=qr`; diğer parametreler korunur). */
export default async function LegacyFeedbacksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) sp.append(k === 'search' ? 'q' : k === 'tab' ? 'type' : k, k === 'tab' ? (x === 'qr' ? 'qr' : 'review') : x);
  permanentRedirect(`/customer/me/voices${sp.size ? `?${sp}` : ''}`);
}
