import { permanentRedirect } from 'next/navigation';

/** Emekli: /dealer/heatmap → Analitik → Yoğunluk (/dealer/analytics/heatmap); sorgu korunur. */
export default async function LegacyDealerHeatmapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) sp.append(k, x);
  permanentRedirect(`/dealer/analytics/heatmap${sp.size ? `?${sp}` : ''}`);
}
