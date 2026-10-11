import { permanentRedirect } from 'next/navigation';
import { legacyRedirectTarget } from '@/lib/admin-economy/contract';

/** Emekli rota: Ekonomi Stüdyosu'na (sorgu parametreleri korunarak) kalıcı yönlenir. */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(legacyRedirectTarget('leagues', await searchParams));
}
