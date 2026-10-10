'use client';

import Link from 'next/link';
import { Gift, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import { HOME_LINKS } from '@/lib/customer-home/core';
import type { HomeSurpriseBox } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';

/**
 * Günlük sürpriz kutu girişi. Kutu açılışı (ve 3D sahnesi) kutular sayfasında; burada yalnız
 * bugünkü durum (DB: bugünün kutusu açıldı mı) ve açılmamış kutu sayısı.
 */
export function SurpriseBoxCard({ box }: { box: HomeSurpriseBox }) {
  const { copy } = useHomeCopy();
  const ready = !box.openedToday;

  return (
    <GlowCard accent="warning" className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-warning-border bg-warning-subtle text-warning" aria-hidden>
          {ready ? <Gift className="size-5" /> : <PackageOpen className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="qx-h3 text-fg">{copy.boxTitle}</h2>
          <p className="qx-small text-fg-muted">{ready ? copy.boxReady : copy.boxOpened}</p>
          {box.unopened > 0 ? <p className="qx-caption text-fg-muted">{copy.boxUnopened(box.unopened)}</p> : null}
        </div>
      </div>
      {ready || box.unopened > 0 ? (
        <Button asChild variant={ready ? 'default' : 'outline'} className="mt-auto min-h-11 w-full gap-2">
          <Link href={HOME_LINKS.surpriseBoxes}>
            <Gift className="size-4" aria-hidden />
            {ready ? copy.boxOpen : copy.boxSee}
          </Link>
        </Button>
      ) : (
        <CountdownChip className="mt-auto self-start" />
      )}
    </GlowCard>
  );
}
