import { permanentRedirect } from 'next/navigation';

/** Emekli: tek onay kuyruğu artık Segmentler → Öneriler sekmesinde. Sorgu parametreleri korunur. */
export default async function LegacySegmentProposalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  sp.set('tab', 'oneriler');
  permanentRedirect(`/admin/segments?${sp.toString()}`);
}
