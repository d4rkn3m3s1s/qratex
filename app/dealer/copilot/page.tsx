import { permanentRedirect } from 'next/navigation';
import { legacyHref, type LegacySearchParams } from '@/lib/dealer-today/legacy-redirect';

// Emekli: /dealer/copilot → Bugün (sıradaki adımlar + yapılacaklar); sorgu korunur.
export default async function LegacyDealerCopilot({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await legacyHref('/dealer', searchParams));
}
