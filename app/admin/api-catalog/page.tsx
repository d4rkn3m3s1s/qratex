import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/api-catalog → Entegrasyonlar › API kataloğu. Sorgu parametreleri korunur. */
export default async function LegacyApiCatalogRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) sp.append(k, x);
  sp.set('tab', 'katalog');
  permanentRedirect(`/admin/integrations?${sp.toString()}`);
}
