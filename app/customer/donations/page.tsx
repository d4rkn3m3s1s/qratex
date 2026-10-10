import { permanentRedirect } from 'next/navigation';

/** EMEKLİ: /customer/donations → Cüzdan → Bağış (`?tab=leaderboard` Topluluk sekmesine düşer). Sorgu parametreleri korunur. */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (typeof value === 'string') qs.append(key, value);
  }
  const query = qs.toString();
  permanentRedirect(`/customer/wallet/donate${query ? `?${query}` : ''}`);
}
