import { permanentRedirect } from 'next/navigation';
import { retiredRedirectTarget } from '@/lib/play-hub/retired';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Emekli oyun (yol haritası §7.3 KALDIR) → Oyna merkezi; sorgu parametreleri korunur. */
export default async function Page({ searchParams }: Props) {
  permanentRedirect(retiredRedirectTarget('lucky-wheel', await searchParams));
}
