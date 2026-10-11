import { permanentRedirect } from 'next/navigation';

/** Emekli rota: Ayarlar › Abonelik sekmesine kalıcı yönlenir (sorgu korunur; Stripe dönüşü `session_id` dahil). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (k === 'tab') continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (typeof v === 'string') q.set(k, v);
  }
  q.set('tab', 'billing');
  permanentRedirect(`/dealer/settings?${q.toString()}`);
}
