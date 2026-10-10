import { permanentRedirect } from 'next/navigation';
import { progressRedirectHref, type RetiredSearchParams } from '@/components/customer/m-ben-ilerleme/retired-route';

// Emekli: /customer/analytics → Ben → İlerleme (/customer/me/progress). Sorgu parametreleri korunur.
export default async function RetiredAnalytics({ searchParams }: { searchParams: RetiredSearchParams }) {
  permanentRedirect(await progressRedirectHref(searchParams));
}
