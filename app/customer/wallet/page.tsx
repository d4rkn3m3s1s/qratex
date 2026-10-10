import { redirect } from 'next/navigation';

/** `/customer/wallet` → varsayılan sekme Kartım (sorgu dizesi korunur). */
export default async function CustomerWalletIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (typeof value === 'string') qs.append(key, value);
  }
  const query = qs.toString();
  redirect(`/customer/wallet/card${query ? `?${query}` : ''}`);
}
