import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/ai-dashboard → /admin/ai (AI Operasyon Merkezi; sorgu parametreleri korunur). */
export default async function LegacyAiDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) sp.append(k, x);
  const qs = sp.toString();
  permanentRedirect(`/admin/ai${qs ? `?${qs}` : ''}`);
}
