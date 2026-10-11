import { permanentRedirect } from 'next/navigation';

/** Emekli: ekosistem özeti Komuta Merkezi'ne (`/admin`) birleşti. Sorgu parametreleri korunur. */
export default async function EcosystemRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) sp.append(k, x);
  const qs = sp.toString();
  permanentRedirect(qs ? `/admin?${qs}` : '/admin');
}
