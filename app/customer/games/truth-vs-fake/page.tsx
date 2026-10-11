import { permanentRedirect } from 'next/navigation';

/** Emekli: Sahte Avcısı'na birleşti (§7.3) — "kaydir" aşaması. Sorgu parametreleri korunur. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v ? [v] : []) q.append(k, x);
  if (!q.has('mod')) q.set('mod', 'kaydir');
  permanentRedirect(`/customer/games/fake-hunter?${q.toString()}`);
}
