import { permanentRedirect } from 'next/navigation';
import { legacyCalendarTarget } from '@/lib/campaigns-calendar/contract';

/** Emekli rota: Kampanya Takvimi'ne (sorgu parametreleri korunarak) kalıcı yönlenir. */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(legacyCalendarTarget('concept', await searchParams));
}
