import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/shop → Mağaza ve Ödüller → Kozmetik (`/admin/rewards?tab=kozmetik`); sorgu korunur. */
export default async function LegacyAdminShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null && k !== 'tab') sp.append(k, x);
  sp.set('tab', 'kozmetik');
  permanentRedirect(`/admin/rewards?${sp}`);
}
