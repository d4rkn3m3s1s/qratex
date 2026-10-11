import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/partners → Entegrasyonlar › Partnerler. Sorgu parametreleri korunur. */
export default async function LegacyPartnersRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) sp.append(k, x);
  sp.set('tab', 'partnerler');
  permanentRedirect(`/admin/integrations?${sp.toString()}`);
}
