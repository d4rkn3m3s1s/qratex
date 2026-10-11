import { permanentRedirect } from 'next/navigation';

/** Emekli rota: Kar Tanesi Yakala'ya iyi/kötü modifikatörü olarak birleşti (§7.3 #8–9). Sorgu parametreleri korunur. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.set(k, v);
  }
  const qs = q.toString();
  permanentRedirect(`/customer/games/frost-catcher${qs ? `?${qs}` : ''}`);
}
