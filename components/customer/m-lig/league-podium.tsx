'use client';

import { Crown } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { LeagueEmblem } from '@/components/ds/play';
import { listItem } from '@/lib/motion';
import type { LeagueRowDTO } from '@/lib/league-board/types';
import { cn } from '@/lib/utils';
import { LigAvatar } from './lig-avatar';
import { useLigCopy } from './use-lig-copy';

/** Görsel sıra 2-1-3; DOM (ve ekran okuyucu) sırası 1-2-3 (`order`). */
const VISUAL_ORDER = ['order-2', 'order-1', 'order-3'] as const;
const PEDESTAL = ['h-24 sm:h-28', 'h-16 sm:h-20', 'h-12 sm:h-14'] as const;
const AVATAR = [72, 56, 56] as const;

/**
 * Podyum (1–3). 1 ya da 2 kişilik dönemde de görünür; boş basamak dürüstçe "boş" der (B6).
 * Kendi basamağın "Sen" ile işaretlenir (#31). Sonsuz döngü yok: tek giriş animasyonu.
 */
export function LeaguePodium({
  podium,
  unit,
  title,
  headingId,
  compact = false,
  animateEntry = false,
}: {
  podium: LeagueRowDTO[];
  unit: string;
  title: string;
  headingId: string;
  /** Küçük varyant (geçen haftanın ilk üçü). */
  compact?: boolean;
  /** Giriş animasyonu yalnız kullanıcı seçimi değiştirince (sunucu render'ı görünür gelir). */
  animateEntry?: boolean;
}) {
  const { copy, fmt } = useLigCopy();
  const slots: Array<LeagueRowDTO | null> = [podium[0] ?? null, podium[1] ?? null, podium[2] ?? null];

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className={cn('font-semibold text-fg', compact ? 'qx-small' : 'qx-h3')}>
        {title}
      </h2>
      <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {slots.map((row, i) => (
          <Motion.li
            key={row?.key ?? `empty-${i}`}
            variants={listItem}
            custom={i}
            initial={animateEntry ? 'hidden' : false}
            animate="visible"
            className={cn('flex min-w-0 flex-col items-center text-center', VISUAL_ORDER[i])}
            aria-label={row ? copy.rowAria(row.rank, row.name, fmt(row.score), unit, row.isMe) : `${i + 1}. ${copy.podiumEmpty}`}
          >
            {row ? (
              <div className="flex w-full min-w-0 flex-col items-center gap-1.5 pb-2" aria-hidden>
                {i === 0 && !compact ? <Crown className="size-6 text-brand" /> : null}
                <div className={cn('rounded-full p-0.5', row.isMe ? 'ring-2 ring-brand ring-offset-2 ring-offset-background' : '')}>
                  <LigAvatar name={row.name} image={row.image} seed={row.key} size={compact ? 40 : AVATAR[i]} />
                </div>
                <p className="qx-small w-full truncate font-semibold text-fg">
                  {row.isMe ? copy.you : row.name}
                </p>
                <p className="qx-caption tabular-nums text-fg-muted">
                  <span className="font-semibold text-fg">{fmt(row.score)}</span> {unit}
                </p>
                {!compact ? <LeagueEmblem leagueKey={row.leagueKey} name={row.leagueName} size="sm" /> : null}
              </div>
            ) : (
              <p className="qx-caption mb-2 rounded-xl border border-dashed border-strong px-2 py-3 text-fg-muted">
                {copy.podiumEmpty}
              </p>
            )}
            <div
              aria-hidden
              className={cn(
                'flex w-full items-start justify-center rounded-t-xl pt-1.5 font-display font-bold',
                compact ? 'h-8 qx-small' : cn(PEDESTAL[i], 'qx-h3'),
                i === 0
                  ? 'bg-gradient-to-b from-[hsl(var(--gradient-from))] to-[hsl(var(--gradient-to))] text-[hsl(var(--primary-foreground))]'
                  : 'bg-surface-3 text-fg'
              )}
            >
              {i + 1}
            </div>
          </Motion.li>
        ))}
      </ol>
    </section>
  );
}
