import { permanentRedirect } from 'next/navigation';
import { legacyHref, type LegacySearchParams } from '@/lib/dealer-today/legacy-redirect';

// Emekli: /dealer/discover → Bugün (modüller ⌘K paletinde); sorgu korunur.
export default async function LegacyDealerDiscover({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await legacyHref('/dealer', searchParams));
}
