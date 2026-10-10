import { permanentRedirect } from 'next/navigation';
import { legacyHref, type LegacySearchParams } from '@/lib/dealer-today/legacy-redirect';

// Emekli: /dealer/weekly-brief → Bugün → Haftalık rapor; sorgu korunur.
export default async function LegacyDealerWeeklyBrief({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await legacyHref('/dealer', searchParams, { tab: 'weekly' }));
}
