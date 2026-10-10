import { permanentRedirect } from 'next/navigation';

/** Emekli: /customer/surprise-boxes → Cüzdan → Ödüllerim → Kutularım (`?tab=boxes`); sorgu korunur. */
export default async function LegacySurpriseBoxesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null && k !== 'tab') sp.append(k, x);
  sp.set('tab', 'boxes');
  permanentRedirect(`/customer/wallet/owned?${sp}`);
}
