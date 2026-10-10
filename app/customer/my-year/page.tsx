import { permanentRedirect } from 'next/navigation';

/** Emekli rota: "Yılım" artık Ben → Yılım (`/customer/me/year`). Sorgu parametreleri korunur. */
export default async function LegacyMyYearRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const val of Array.isArray(v) ? v : v ? [v] : []) q.append(k, val);
  permanentRedirect(`/customer/me/year${q.size ? `?${q.toString()}` : ''}`);
}
