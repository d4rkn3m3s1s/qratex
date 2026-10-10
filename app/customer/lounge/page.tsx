import { permanentRedirect } from 'next/navigation';
import { walletCardHref, type LegacySearchParams } from '@/lib/wallet-card/legacy-redirect';

// Emekli: /customer/lounge → Cüzdan → Kartım (statü bölümü); sorgu korunur.
export default async function LegacyLounge({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await walletCardHref(searchParams));
}
