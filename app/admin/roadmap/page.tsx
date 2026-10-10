import { permanentRedirect } from 'next/navigation';

// Emekli: /admin/roadmap → Ekip › Girişimler (veritabanı destekli, düzenlenebilir yol haritası).
// Sorgu parametreleri korunur.
export default async function RetiredAdminRoadmap({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  sp.set('tab', 'initiatives');
  permanentRedirect(`/admin/ekip?${sp.toString()}`);
}
