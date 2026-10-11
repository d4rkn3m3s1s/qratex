import { permanentRedirect } from 'next/navigation';

/** Emekli rota: sahtekârlık önleme artık /admin/trust (Vaka kuyruğu sekmesi). Sorgu parametreleri korunur. */
export default async function FraudPreventionRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  if (!sp.has('tab')) sp.set('tab', 'vakalar');
  permanentRedirect(`/admin/trust?${sp.toString()}`);
}
