import { permanentRedirect } from 'next/navigation';

/** Emekli: /admin/ai-detailed → /admin/ai?tab=sinyaller ("Müşteri sesi"; sorgu parametreleri korunur). */
export default async function LegacyAiDetailed({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v != null ? [v] : []) sp.append(k, x);
  if (!sp.has('tab')) sp.set('tab', 'sinyaller');
  permanentRedirect(`/admin/ai?${sp.toString()}`);
}
