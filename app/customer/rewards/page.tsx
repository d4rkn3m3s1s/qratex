import { permanentRedirect } from 'next/navigation';

/** Emekli: /customer/rewards → Cüzdan → Ödüller (`?tab=myRewards` → Ödüllerim); sorgu korunur. */
export default async function LegacyRewardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) sp.append(k, x);
  const owned = sp.get('tab') === 'myRewards';
  if (owned) sp.delete('tab');
  permanentRedirect(`/customer/wallet/${owned ? 'owned' : 'rewards'}${sp.size ? `?${sp}` : ''}`);
}
