import { permanentRedirect } from 'next/navigation';

// Emekli: /customer/badges → /customer/me/badges (sorgu korunur; ?badge= derin linki dahil).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v ? [v] : []) sp.append(k, x);
  const qs = sp.toString();
  permanentRedirect(qs ? `/customer/me/badges?${qs}` : '/customer/me/badges');
}
