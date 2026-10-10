import { permanentRedirect } from 'next/navigation';

/** Emekli: "Keşfet" haritası kaldırıldı (§6.1) → Ana Sayfa; işlevi ⌘K paleti ve sidebar'da. Sorgu korunur. */
export default async function CustomerDiscoverRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) sp.append(k, x);
  const qs = sp.toString();
  permanentRedirect(qs ? `/customer?${qs}` : '/customer');
}
