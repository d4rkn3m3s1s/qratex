import { permanentRedirect } from 'next/navigation';

/** Emekli rota: Trust komuta merkezi artık /admin/trust (Güven Merkezi). Sorgu parametreleri korunur. */
export default async function TrustCommandRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  const qs = sp.toString();
  permanentRedirect(`/admin/trust${qs ? `?${qs}` : ''}`);
}
