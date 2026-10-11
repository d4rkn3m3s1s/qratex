import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/ab-testing → Özellik ve Deney Kontrolü (sorgu parametreleri korunur). */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) sp.append(k, x);
  if (!sp.has('tab')) sp.set('tab', 'deneyler');
  permanentRedirect(`/admin/features?${sp.toString()}`);
}
