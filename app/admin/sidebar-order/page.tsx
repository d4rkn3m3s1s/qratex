import { permanentRedirect } from 'next/navigation';

/** Emekli rota: /admin/sidebar-order → /admin/navigation (Navigasyon Stüdyosu; sorgu parametreleri korunur). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) sp.append(k, item);
  }
  const qs = sp.toString();
  permanentRedirect(`/admin/navigation${qs ? `?${qs}` : ''}`);
}
