'use client';

import { useState } from 'react';
import { KeyRound, Plus, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlowCard, RegisterProvider } from '@/components/ds/play';
import type { SquadOverviewNone } from '@/lib/squads/dto';
import { useKlanCopy } from './copy';
import { LeagueCard } from './league-card';
import { HowItWorksCard } from './power-card';
import { CreateSquadDialog } from './create-squad-dialog';
import { JoinSquadDialog } from './join-squad-dialog';

/**
 * Klansız görünüm: dürüst vaat (oranlar kurallardan), kur/katıl ve keşif için gerçek lig.
 * Önceki "%5 ekstra pasif puan" vaadi kaldırıldı (customer_squads.md envanter 3, Bulgu 2).
 */
export function NoSquadView({ data, joinCode }: { data: SquadOverviewNone; joinCode?: string }) {
  const copy = useKlanCopy();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(!!joinCode);

  return (
    <RegisterProvider value="play">
      <div data-register="play" className="mx-auto w-full max-w-5xl space-y-5">
        <GlowCard className="space-y-5">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-subtle text-brand-text">
              <Swords className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{copy.eyebrow}</p>
              <h1 className="text-balance font-display text-2xl font-bold text-fg sm:text-3xl">{copy.noneTitle}</h1>
              <p className="mt-2 text-pretty text-sm text-fg-muted sm:text-base">{copy.noneLead}</p>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {copy.noneBullets.map((b) => (
              <li key={b} className="rounded-xl border border-subtle bg-surface-2/60 p-3 text-sm text-fg">
                {b}
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Button className="w-full" size="lg" onClick={() => setCreateOpen(true)}>
                <Plus className="h-5 w-5" aria-hidden /> {copy.createCta}
              </Button>
              <p className="text-xs text-fg-muted">{copy.createHint}</p>
            </div>
            <div className="space-y-1.5">
              <Button className="w-full" size="lg" variant="outline" onClick={() => setJoinOpen(true)}>
                <KeyRound className="h-5 w-5" aria-hidden /> {copy.joinCta}
              </Button>
              <p className="text-xs text-fg-muted">{copy.joinHint}</p>
            </div>
          </div>
        </GlowCard>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <LeagueCard league={data.league} discovery />
          <HowItWorksCard />
        </div>

        <CreateSquadDialog open={createOpen} onOpenChange={setCreateOpen} />
        <JoinSquadDialog open={joinOpen} onOpenChange={setJoinOpen} initialCode={joinCode} />
      </div>
    </RegisterProvider>
  );
}
