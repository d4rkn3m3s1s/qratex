import { permanentRedirect } from 'next/navigation';
import { legacyPlacesHref, type LegacySearchParams } from '@/lib/places/legacy-redirect';

// Emekli: Keşfet sekmesine taşındı (/customer/places). Sorgu korunur; ?focus/?dealerId → ?venue.
export default async function LegacyRedirect({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(legacyPlacesHref('category-leaderboard', await searchParams));
}
