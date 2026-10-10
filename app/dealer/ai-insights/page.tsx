import { permanentRedirect } from 'next/navigation';

/** Emekli: `/dealer/ai-insights` → `/dealer/analytics/insights` (sorgu parametreleri korunur). */
export default async function DealerAiInsightsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v == null ? [] : [v]) qs.append(k, x);
  const s = qs.toString();
  permanentRedirect(`/dealer/analytics/insights${s ? `?${s}` : ''}`);
}
