import { permanentRedirect } from 'next/navigation';

/** Emekli rota → Otomasyon (/dealer/automation/replies). Sorgu parametreleri korunur. */
export default async function LegacyAutoRepliesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v != null ? [v] : []) qs.append(k, one);
  const s = qs.toString();
  permanentRedirect(`/dealer/automation/replies${s ? `?${s}` : ''}`);
}
