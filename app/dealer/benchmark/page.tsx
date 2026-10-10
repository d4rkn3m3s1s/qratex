import { permanentRedirect } from 'next/navigation';
import { legacyHref, type LegacySearchParams } from '@/components/dealer/b-kiyas-etki/legacy-redirect';

// Emekli rota → /dealer/analytics/benchmark (sorgu parametreleri korunur).
export default async function LegacyRedirect({ searchParams }: { searchParams: LegacySearchParams }) {
  permanentRedirect(await legacyHref('/dealer/analytics/benchmark', searchParams));
}
