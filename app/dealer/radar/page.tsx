import { permanentRedirect } from 'next/navigation';

/** Emekli rota → Müşteriler · Geri kazanım sekmesi (sorgu parametreleri korunur). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x !== undefined && k !== 'tab') sp.append(k, x);
  sp.set('tab', 'winback');
  permanentRedirect(`/dealer/customers?${sp.toString()}`);
}
