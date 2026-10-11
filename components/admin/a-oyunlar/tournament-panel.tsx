'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Medal, Swords, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { QueryState, SectionCard, TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { fetchTournament, fmt, fmtDateTime, gamesKeys } from './api';
import { useGamesCopy } from './copy';

/**
 * Haftalık turnuva (salt-okunur + oyuna geçiş). Rotasyon (haftaya dondurulmuş TOURNAMENT_ROTATION
 * takvimi) ve ödül tablosu kod sabitidir (lib/game-tournament.ts, lib/tournament-core.ts); ödülleri
 * günlük `tournament-settle` işi otomatik dağıtır. Yönetim kolu öne çıkan oyunun ayarları ve aç/kapat anahtarıdır.
 */
export function TournamentPanel({ onOpenGame }: { onOpenGame: (gameType: string) => void }) {
  const c = useGamesCopy().tournament;
  const q = useQuery({ queryKey: gamesKeys.tournament(), queryFn: fetchTournament, staleTime: 60_000 });
  return (
    <QueryState query={q} skeleton="list">
      {(t) => {
        const prizeActive = t.participants >= t.minParticipants;
        return (
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <CalendarClock className="h-4 w-4" aria-hidden />
              {c.week} <strong className="tabular-nums text-fg">{t.weekKey}</strong> · {c.ends} {fmtDateTime(t.endsAt)} {c.tz}
            </p>
            <MetricGrid cols={3}>
              <MetricTile label={c.participants} icon={<Users />} tone="brand" metric={{ value: t.participants, unit: c.minUnit(t.minParticipants) }} />
              <MetricTile label={c.firstPrize} icon={<Medal />} tone="warning" metric={{ value: prizeActive ? t.prizes[1] : 0, unit: c.points }} hint={prizeActive ? c.thresholdMet : c.thresholdMiss} />
              <MetricTile label={c.lastClaims} icon={<Swords />} metric={{ value: t.lastWeek.claims.length }} hint={t.lastWeek.unclaimed > 0 ? c.unclaimed(t.lastWeek.unclaimed) : undefined} />
            </MetricGrid>

            {t.featuredGameType && !t.featuredEnabled && (
              <p className={cn('rounded-control border px-3 py-2 text-sm', TONE_CALLOUT.danger)}>
                {c.disabled}
              </p>
            )}

            <SectionCard
              title={t.featuredTitle ? c.featured(t.featuredTitle) : c.none}
              description={c.liveDesc}
              actions={
                t.featuredGameType ? (
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => onOpenGame(t.featuredGameType!)}>
                    {c.openSettings}
                  </Button>
                ) : null
              }
            >
              {t.top.length === 0 ? (
                <p className="text-sm text-fg-muted">{c.noAttempts}</p>
              ) : (
                <ol className="divide-y divide-border">
                  {t.top.map((e) => (
                    <li key={e.rank} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-6 text-right font-semibold tabular-nums text-fg-muted">{e.rank}.</span>
                      <span className="flex-1">{e.name}</span>
                      <span className="tabular-nums">{c.score(fmt(e.best))}</span>
                      {e.prize > 0 && <StatusBadge size="sm" tone="warning" label={c.pts(fmt(e.prize))} icon={Medal} />}
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title={c.rotation} description={c.rotationDesc}>
                <ol className="space-y-1 text-sm">
                  {t.rotation.map((r, i) => (
                    <li key={r.weekKey} className="flex justify-between gap-2">
                      <span className="tabular-nums text-fg-muted">{r.weekKey}{i === 0 ? c.thisWeek : ''}</span>
                      <span className="font-medium">{r.title ?? '—'}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-fg-muted">
                  {c.rotationNote}
                </p>
              </SectionCard>
              <SectionCard title={c.lastWeek(t.lastWeek.weekKey)} description={t.lastWeek.title ? c.lastWeekDesc(t.lastWeek.title, fmt(t.lastWeek.participants)) : c.noTournament}>
                {t.lastWeek.participants < t.minParticipants ? (
                  <p className="text-sm text-fg-muted">{c.belowMin(t.minParticipants)}</p>
                ) : t.lastWeek.claims.length === 0 ? (
                  <p className="text-sm text-fg-muted">{c.notYet}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {t.lastWeek.claims.map((cl) => (
                      <li key={cl.rank} className="flex justify-between gap-2">
                        <span>
                          {cl.rank}. {cl.name}
                        </span>
                        <span className="tabular-nums text-fg-muted">
                          {c.pts(fmt(cl.points))} · {fmtDateTime(cl.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
