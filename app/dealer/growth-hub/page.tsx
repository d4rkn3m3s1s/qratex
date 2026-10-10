import { permanentRedirect } from 'next/navigation';
import { legacyHref, type LegacySearchParams } from '@/lib/dealer-today/legacy-redirect';

// Emekli: /dealer/growth-hub → Analitik; sorgu korunur.
export default async function LegacyDealerGrowthHub({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await legacyHref('/dealer/analytics', searchParams));
}
