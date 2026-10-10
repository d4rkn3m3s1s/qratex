import { permanentRedirect } from 'next/navigation';

/** Emekli rota: Ayarlar artık Ben → Ayarlar'da. Sorgu (ör. `?tab=privacy`) korunur. */
export default async function LegacyCustomerSettings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) (Array.isArray(v) ? v : v === undefined ? [] : [v]).forEach((x) => q.append(k, x));
  permanentRedirect(`/customer/me/settings${q.size ? `?${q.toString()}` : ''}`);
}
