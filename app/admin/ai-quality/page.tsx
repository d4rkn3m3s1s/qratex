import { permanentRedirect } from 'next/navigation';

/** Emekli rota: AI kalite incelemesi artık /admin/ai/quality (İnceleme sekmesi). Sorgu parametreleri korunur. */
export default async function AiQualityRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v !== undefined) sp.set(k, v);
  }
  const qs = sp.toString();
  permanentRedirect(`/admin/ai/quality${qs ? `?${qs}` : ''}`);
}
