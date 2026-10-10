import { permanentRedirect } from 'next/navigation';
import { legacyHref, type LegacySearchParams } from '@/lib/dealer-today/legacy-redirect';

// Emekli: /dealer/operations-brief → Bugün (operasyon özeti); sorgu korunur.
export default async function LegacyDealerOperationsBrief({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await legacyHref('/dealer', searchParams));
}
