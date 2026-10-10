import { permanentRedirect } from 'next/navigation';

/** EMEKLİ: /customer/spending-overview → Cüzdan → Hareketler → Özet. Sorgu parametreleri korunur. */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (typeof value === 'string') qs.append(key, value);
  }
  if (!qs.has('tab')) qs.set('tab', 'summary');
  const query = qs.toString();
  permanentRedirect(`/customer/wallet/activity${query ? `?${query}` : ''}`);
}
