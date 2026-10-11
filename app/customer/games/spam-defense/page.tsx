import { permanentRedirect } from 'next/navigation';

/** Emekli rota: Çekirdek Savunması'na birleşti (§7.3 #6–7). Sorgu parametreleri korunur. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.set(k, v);
  }
  const qs = q.toString();
  permanentRedirect(`/customer/games/core-defense${qs ? `?${qs}` : ''}`);
}
