import { permanentRedirect } from 'next/navigation';

/** Emekli rota: `/customer/referral` → Ben · Davet (`/customer/me/invite`), sorgu parametreleri korunur. */
export default async function LegacyReferralRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.set(k, v);
  }
  const qs = q.toString();
  permanentRedirect(`/customer/me/invite${qs ? `?${qs}` : ''}`);
}
