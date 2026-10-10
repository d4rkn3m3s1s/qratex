'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { RegisterProvider } from '@/components/ds/play';
import type { SquadOverviewMember } from '@/lib/squads/dto';
import { squadApi, squadKeys } from './api';
import { useKlanCopy } from './copy';
import { SquadHero } from './squad-hero';
import { WeeklyGoalCard } from './weekly-goal-card';
import { BattleCard } from './battle-card';
import { RosterCard } from './roster-card';
import { LeagueCard } from './league-card';
import { ActivityCard } from './activity-card';
import { HowItWorksCard, PowerCard } from './power-card';
import { BattleHistory } from './battle-history';

const BATTLE_POLL_MS = 15_000;

/** Klan odası — mobilde tek sütun, masaüstünde içerik + yan sütun. */
export function MemberRoom({ data, joinCode }: { data: SquadOverviewMember; joinCode?: string }) {
  const copy = useKlanCopy();
  const qc = useQueryClient();

  // Canlı skor: yalnız açık savaş varken ve sekme görünürken (React Query arka planda yoklamaz).
  const battleQ = useQuery({
    queryKey: squadKeys.battle,
    queryFn: squadApi.battle,
    initialData: { ...data.battle, isOwner: data.viewer.isOwner },
    staleTime: 10_000,
    refetchInterval: (q) => (q.state.data?.battle ? BATTLE_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
  const battle = battleQ.data ?? { ...data.battle, isOwner: data.viewer.isOwner };

  // Özet yenilendiğinde savaş önbelleğini eşitle.
  useEffect(() => {
    qc.setQueryData(squadKeys.battle, { ...data.battle, isOwner: data.viewer.isOwner });
  }, [qc, data.battle, data.viewer.isOwner]);

  // Savaş durumu değişince (başladı / bitti) kadro ve günlük de tazelensin.
  const sig = `${battle.battle?.id ?? ''}:${battle.battle?.status ?? ''}:${battle.recentResult?.id ?? ''}`;
  const lastSig = useRef(sig);
  useEffect(() => {
    if (lastSig.current !== sig) {
      lastSig.current = sig;
      void qc.invalidateQueries({ queryKey: squadKeys.overview });
    }
  }, [sig, qc]);

  const otherInvite = joinCode && joinCode.toUpperCase() !== data.squad.inviteCode;

  return (
    <RegisterProvider value="play">
      <div data-register="play" className="mx-auto w-full max-w-6xl space-y-5">
        {otherInvite ? (
          <p role="status" className="flex items-start gap-2 rounded-xl border border-info-border bg-info-subtle p-3 text-sm text-fg">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
            {copy.otherInviteNote}
          </p>
        ) : null}
        <SquadHero data={{ ...data, battle }} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5">
            <WeeklyGoalCard goal={data.weeklyGoal} frozen={data.squad.isFrozen} />
            <BattleCard state={battle} isOwner={data.viewer.isOwner} frozen={data.squad.isFrozen} balance={data.viewer.balance} />
            <RosterCard
              squadId={data.squad.id}
              members={data.members}
              isOwner={data.viewer.isOwner}
              maxMembers={data.squad.maxMembers}
              battleActive={battle.battle?.status === 'active'}
            />
          </div>
          <aside className="min-w-0 space-y-5" aria-label={copy.leagueTitle}>
            <LeagueCard league={data.league} />
            <ActivityCard items={data.activity} />
            <PowerCard squad={data.squad} />
            <BattleHistory />
            <HowItWorksCard />
          </aside>
        </div>
      </div>
    </RegisterProvider>
  );
}
