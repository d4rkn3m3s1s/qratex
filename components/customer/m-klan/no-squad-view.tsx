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
          <div className="min-w-0">
            <p className="qx-overline inline-flex items-center gap-1.5 text-fg-muted">
              <Swords aria-hidden className="h-4 w-4 text-brand" />
              {copy.eyebrow}
            </p>
            <h1 className="qx-h1 mt-1 text-balance text-fg">{copy.noneTitle}</h1>
            <p className="qx-body mt-2 max-w-prose text-pretty text-fg-muted">{copy.noneLead}</p>
          </div>
          {/* Maddeler eşit kart değil, sıralı tek liste: okuma sırası = nasıl işlediği. */}
          <ol className="divide-y divide-subtle border-y border-subtle">
            {copy.noneBullets.map((b, i) => (
              <li key={b} className="flex items-baseline gap-3 py-2.5 qx-small text-fg">
                <span aria-hidden className="qx-num w-4 shrink-0 font-semibold text-fg-subtle">{i + 1}</span>
                {b}
              </li>
            ))}
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Button className="w-full" size="lg" onClick={() => setCreateOpen(true)}>
                <Plus className="h-5 w-5" aria-hidden /> {copy.createCta}
              </Button>
              <p className="qx-caption text-fg-muted">{copy.createHint}</p>
            </div>
            <div className="space-y-1.5">
              <Button className="w-full" size="lg" variant="outline" onClick={() => setJoinOpen(true)}>
                <KeyRound className="h-5 w-5" aria-hidden /> {copy.joinCta}
              </Button>
              <p className="qx-caption text-fg-muted">{copy.joinHint}</p>
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
