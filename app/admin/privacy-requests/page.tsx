import { permanentRedirect } from 'next/navigation';

/** Emekli: KVKK talepleri artık /admin/privacy merkezinin "Talepler" sekmesinde. */
export default async function LegacyPrivacyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(v) ? v : v != null ? [v] : []) sp.append(k, item);
  }
  if (!sp.has('tab')) sp.set('tab', 'talepler');
  permanentRedirect(`/admin/privacy?${sp.toString()}`);
}
