import { permanentRedirect } from 'next/navigation';

/** Emekli rota: savaşlar artık Klan Merkezi'nin "Savaşlar" sekmesinde. Sorgu parametreleri korunur. */
export default async function AdminSquadBattlesRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  sp.set('tab', 'battles');
  permanentRedirect(`/admin/squads?${sp.toString()}`);
}
