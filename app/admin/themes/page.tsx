import { permanentRedirect } from 'next/navigation';

/** Emekli rota: /admin/themes → /admin/design-system?tab=temalar (sorgu parametreleri korunur). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (k === 'tab') continue;
    for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) sp.append(k, item);
  }
  sp.set('tab', 'temalar');
  permanentRedirect(`/admin/design-system?${sp.toString()}`);
}
