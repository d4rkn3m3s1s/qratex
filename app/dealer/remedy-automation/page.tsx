import { permanentRedirect } from 'next/navigation';

/** Emekli rota → Otomasyon (/dealer/automation/remedy). Sorgu parametreleri korunur. */
export default async function LegacyRemedyAutomationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v != null ? [v] : []) qs.append(k, one);
  const s = qs.toString();
  permanentRedirect(`/dealer/automation/remedy${s ? `?${s}` : ''}`);
}
