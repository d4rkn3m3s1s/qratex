import { loadTournamentTab } from '@/lib/play-hub/server';
import type { PlayLocale } from './copy';
import { TournamentBoard } from './tournament';

/** "Turnuva" sekmesi (`/customer/games?tab=tournament`) — sunucu bileşeni. */
export async function TournamentTab({ userId, locale }: { userId: string; locale: PlayLocale }) {
  const d = await loadTournamentTab(userId);
  return <TournamentBoard locale={locale} data={d.tournament} myWeek={d.myWeek} />;
}
