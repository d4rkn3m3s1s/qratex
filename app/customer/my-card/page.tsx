import { permanentRedirect } from 'next/navigation';

/** Emekli: /customer/my-card → Cüzdan → Kartım (sorgu dizesi korunur). */
export default async function LegacyMyCard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) (Array.isArray(v) ? v : v === undefined ? [] : [v]).forEach((x) => qs.append(k, x));
  permanentRedirect(`/customer/wallet/card${qs.size ? `?${qs}` : ''}`);
}
