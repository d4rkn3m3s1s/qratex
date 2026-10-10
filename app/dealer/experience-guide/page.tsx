import { permanentRedirect } from 'next/navigation';
import { legacyHref, type LegacySearchParams } from '@/lib/dealer-today/legacy-redirect';

// Emekli: /dealer/experience-guide → Bugün; sorgu korunur.
export default async function LegacyDealerExperienceGuide({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await legacyHref('/dealer', searchParams));
}
