'use client';

import { Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import type { HomeSpin } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';
import { useHomeCache } from './use-home';

/** Çark girişi — durum BFF'ten gelir (ikinci bir GET yok). Diyalog tıklanınca yüklenir. */
export function SpinCard({ spin, onOpen }: { spin: HomeSpin; onOpen: () => void }) {
  const { copy } = useHomeCopy();
  const { refresh } = useHomeCache();
  const available = spin.remaining > 0;

  return (
    <GlowCard accent="category-3" className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-border bg-brand-subtle text-brand" aria-hidden>
          <Dices className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="qx-h3 text-fg">{copy.spinTitle}</h2>
          <p className="qx-small text-fg-muted">{available ? copy.spinRemaining(spin.remaining) : copy.spinUsed}</p>
        </div>
      </div>
      {available ? (
        <Button className="mt-auto min-h-11 w-full gap-2" onClick={onOpen}>
          <Dices className="size-4" aria-hidden />
          {copy.spinOpen}
        </Button>
      ) : (
        // Gece yarısı (İstanbul) yeni hak açılır: sayfa açık kalsa da kart kendini tazeler.
        <CountdownChip className="mt-auto self-start" label={copy.spinNext} onExpire={() => void refresh()} />
      )}
    </GlowCard>
  );
}
