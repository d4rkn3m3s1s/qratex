import { permanentRedirect } from 'next/navigation';

/** Emekli: /customer/shop → Cüzdan → Ödüller → Kozmetik (`?tab=cosmetics`); sorgu korunur. */
export default async function LegacyShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null && k !== 'tab') sp.append(k, x);
  sp.set('tab', 'cosmetics');
  permanentRedirect(`/customer/wallet/rewards?${sp}`);
}
