import { permanentRedirect } from 'next/navigation';

/** Emekli: /dealer/action-items → /dealer/inbox/assigned (sorgu parametreleri korunur). */
export default async function LegacyActionItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, one);
  const s = qs.toString();
  permanentRedirect(`/dealer/inbox/assigned${s ? `?${s}` : ''}`);
}
