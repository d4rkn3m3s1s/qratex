import { Gamepad2 } from 'lucide-react';
import { loadGamesTab } from '@/lib/play-hub/server';
import { localizeGamesTab } from '@/lib/play-hub/catalog-en';
import { playHubCopy, type PlayLocale } from './copy';
import { Achievements } from './achievements';
import { DailyQuests } from './daily-quests';
import { FeaturedCard } from './featured-card';
import { GameGrid, ModeSwitch, type HubMode } from './game-grid';
import { GamePass } from './game-pass';
import { StatusStrip } from './status-strip';
import { PendingRewardBanner, TournamentCard } from './tournament';

/**
 * "Oyunlar" sekmesi (sunucu bileşeni): tüm kritik veri tek `loadGamesTab` çağrısında,
 * paralel ve bölüm bazında hataya dayanıklı. İstemci adaları yalnız talep düğmeleri,
 * sayaçlar ve hareket.
 */
export async function GamesTab({ userId, locale, mode }: { userId: string; locale: PlayLocale; mode: HubMode }) {
  const c = playHubCopy(locale);
  const d = localizeGamesTab(await loadGamesTab(userId), locale);
  const todayEntries = d.today.ok ? d.today.data.entries : null;
  const bests = d.bests.ok ? d.bests.data : null;
  const tournamentType = d.tournament.ok ? d.tournament.data.featured?.gameType ?? null : null;
  const practiceGame = d.catalog.find((g) => g.practice) ?? null;

  return (
    <div className="space-y-section">
      {d.tournament.ok && d.tournament.data.pendingReward && (
        <PendingRewardBanner locale={locale} pending={d.tournament.data.pendingReward} />
      )}

      <StatusStrip
        locale={locale}
        streak={d.streak}
        today={d.today}
        earnings={d.earnings}
        totalGames={d.catalog.length}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <FeaturedCard
          locale={locale}
          game={d.featured}
          isTournament={!!d.featured && d.featured.gameType === tournamentType}
          personalBest={d.featured ? bests?.get(d.featured.gameType) ?? null : null}
          resetAt={d.today.ok ? d.today.data.resetAt : null}
          practiceHref={practiceGame ? `${practiceGame.href}?kip=pratik` : null}
        />
        <TournamentCard locale={locale} data={d.tournament} />
      </div>

      <section aria-labelledby="hub-games" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="hub-games" className="flex items-center gap-2 qx-h2 text-fg">
            <Gamepad2 className="size-6 text-brand" aria-hidden />
            {c.gamesTitle}
          </h2>
          <ModeSwitch locale={locale} mode={mode} />
        </div>
        <GameGrid
          locale={locale}
          mode={mode}
          games={d.catalog}
          today={todayEntries}
          todayFailed={!d.today.ok}
          bests={bests}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DailyQuests locale={locale} today={d.today} />
        <GamePass locale={locale} data={d.pass} />
      </div>

      <Achievements locale={locale} data={d.achievements} />
    </div>
  );
}
