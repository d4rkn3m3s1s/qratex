import { permanentRedirect } from 'next/navigation';

/** /admin/insights emekli: sektör kıyası artık Platform analitiği → Sektörler sekmesi (sorgu korunur). */
export default async function AdminInsightsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (typeof v === 'string') sp.set(k, v);
  }
  sp.set('tab', 'sectors');
  permanentRedirect(`/admin/analytics?${sp.toString()}`);
}
