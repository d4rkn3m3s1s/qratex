import { permanentRedirect } from 'next/navigation';

/**
 * Emekli rota: QRA sohbet kayıtları artık /admin/ai/quality "Sohbet denetimi" sekmesinde.
 * Sorgu parametreleri korunur; eski `q` araması yeni `cq` anahtarına taşınır.
 */
export default async function QraChatLogsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    const key = k === 'q' ? 'cq' : k === 'page' ? 'cpage' : k;
    if (Array.isArray(v)) v.forEach((x) => sp.append(key, x));
    else if (v !== undefined) sp.set(key, v);
  }
  sp.set('tab', 'sohbet');
  permanentRedirect(`/admin/ai/quality?${sp.toString()}`);
}
