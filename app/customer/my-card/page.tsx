import { permanentRedirect } from 'next/navigation';
import { walletCardHref, type LegacySearchParams } from '@/lib/wallet-card/legacy-redirect';

// Emekli: /customer/my-card → Cüzdan → Kartım; sorgu korunur.
export default async function LegacyMyCard({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await walletCardHref(searchParams));
}
