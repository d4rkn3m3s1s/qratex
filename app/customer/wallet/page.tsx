import { redirect } from 'next/navigation';
import { walletCardHref, type LegacySearchParams } from '@/lib/wallet-card/legacy-redirect';

/** `/customer/wallet` → varsayılan sekme Kartım (sorgu dizesi korunur; `?present=1` dahil). */
export default async function CustomerWalletIndex({ searchParams }: { searchParams: LegacySearchParams }) {
  redirect(await walletCardHref(searchParams));
}
