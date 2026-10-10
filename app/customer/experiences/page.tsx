import { permanentRedirect } from 'next/navigation';

/**
 * `/customer/experiences` emekli (yol haritası §6.1): içerik mekân detayına taşındı.
 * `?dealerId=X` → `/customer/places/X`; diğer her şey → `/customer/places` (sorgu korunur).
 */
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomerExperiencesRedirect({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.set(k, v);
  }
  const dealerId = q.get('dealerId')?.trim();
  if (dealerId && /^[A-Za-z0-9_-]{8,64}$/.test(dealerId)) {
    q.delete('dealerId');
    const rest = q.toString();
    permanentRedirect(`/customer/places/${dealerId}${rest ? `?${rest}` : ''}`);
  }
  const s = q.toString();
  permanentRedirect(s ? `/customer/places?${s}` : '/customer/places');
}
