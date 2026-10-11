import { permanentRedirect } from 'next/navigation';

/** Emekli: uyum merkezi artık /admin/privacy (genel bakış, envanter, saklama, rıza, 5651 kayıtları). */
export default async function LegacyCompliancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(v) ? v : v != null ? [v] : []) sp.append(k, item);
  }
  const qs = sp.toString();
  permanentRedirect(qs ? `/admin/privacy?${qs}` : '/admin/privacy');
}
