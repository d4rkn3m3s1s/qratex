import { permanentRedirect } from 'next/navigation';

/** Emekli: AI içgörüleri → Seslerim "Sesin" özet kartı (bayi triyaj metrikleri kaldırıldı), sorgu parametreleri korunur. */
export default async function LegacyAiInsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null && k !== 'tab') sp.append(k, x);
  permanentRedirect(`/customer/me/voices${sp.size ? `?${sp}` : ''}`);
}
