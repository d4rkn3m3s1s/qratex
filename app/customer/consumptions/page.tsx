import { permanentRedirect } from 'next/navigation';

/** EMEKLİ: /customer/consumptions → Cüzdan → Hareketler → Ziyaretler (`?hasReview=false` derin bağlantısı orada anlaşılır). Ziyaret detayı (`/customer/consumptions/[id]`) Seslerim yüzeyinindir ve yerinde kalır. Sorgu parametreleri korunur. */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (typeof value === 'string') qs.append(key, value);
  }
  if (!qs.has('tab')) qs.set('tab', 'visits');
  const query = qs.toString();
  permanentRedirect(`/customer/wallet/activity${query ? `?${query}` : ''}`);
}
