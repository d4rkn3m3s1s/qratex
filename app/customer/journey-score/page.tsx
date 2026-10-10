import { permanentRedirect } from 'next/navigation';
import { progressRedirectHref, type RetiredSearchParams } from '@/components/customer/m-ben-ilerleme/retired-route';

// Emekli: /customer/journey-score → Ben → İlerleme (/customer/me/progress). Sorgu parametreleri korunur.
export default async function RetiredJourneyScore({ searchParams }: { searchParams: RetiredSearchParams }) {
  permanentRedirect(await progressRedirectHref(searchParams));
}
