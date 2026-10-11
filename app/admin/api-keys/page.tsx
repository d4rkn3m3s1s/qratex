import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/api-keys → Entegrasyonlar › API anahtarları. Sorgu parametreleri korunur. */
export default async function LegacyApiKeysRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) sp.append(k, x);
  sp.set('tab', 'anahtarlar');
  if (sp.get('new') === '1') {
    sp.delete('new');
    sp.set('create', 'key');
  }
  permanentRedirect(`/admin/integrations?${sp.toString()}`);
}
