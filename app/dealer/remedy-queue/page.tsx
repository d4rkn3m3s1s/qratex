import { permanentRedirect } from 'next/navigation';

/** Emekli: /dealer/remedy-queue → /dealer/inbox/remedy (sorgu parametreleri korunur). */
export default async function LegacyRemedyQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, one);
  const s = qs.toString();
  permanentRedirect(`/dealer/inbox/remedy${s ? `?${s}` : ''}`);
}
