'use client';

import { forwardRef, useMemo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TONE_CHIP, type Tone } from '@/components/states';
import { listItem } from '@/lib/motion';
import { ISTANBUL_TZ, addDays, istanbulDay } from '../page/date-range';
import { useDataCopy, useLocaleInfo } from './copy';
import { TONE_ICON } from './status-badge';

export type TimelineEvent = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Olay anı (ISO dizgi, epoch ms ya da Date). */
  at: string | number | Date;
  tone?: Tone;
  /** Özel ikon (varsayılan: tonun ikonu). */
  icon?: LucideIcon;
  /** Kim yaptı (ör. "Ayşe · Admin"). */
  actor?: ReactNode;
  /** Sağ üstte ek bilgi / aksiyon (ör. "Geri al" bağlantısı). */
  meta?: ReactNode;
};

export type TimelineProps = {
  events: readonly TimelineEvent[];
  /** İstanbul gününe göre gruplandır ("Bugün", "Dün", "7 Eki 2026"). */
  groupByDay?: boolean;
  /** Saat biçimi: yalnız saat (gruplu varsayılan) ya da tarih+saat. */
  timeStyle?: 'time' | 'datetime';
  dense?: boolean;
  /** Play kaydı: ilk 12 öğe bütçeli kademeyle girer. Ops'ta kapalı. */
  animate?: boolean;
  emptyLabel?: ReactNode;
  /** Liste etiketi (ekran okuyucu). */
  ariaLabel?: string;
  className?: string;
};

function toDate(at: TimelineEvent['at']): Date {
  return at instanceof Date ? at : new Date(at);
}

/**
 * Olay zaman çizelgesi — `<ol>` + `<time dateTime>`; saatler Europe/Istanbul.
 * Her olayın ton ikonu var (yalnız renge dayanmaz). Sıralama çağırana ait
 * (sunucu sırasını korur).
 */
export const Timeline = forwardRef<HTMLDivElement, TimelineProps>(function Timeline(
  { events, groupByDay = false, timeStyle, dense = false, animate = false, emptyLabel, ariaLabel, className },
  ref,
) {
  const copy = useDataCopy();
  const { tag } = useLocaleInfo();
  const style = timeStyle ?? (groupByDay ? 'time' : 'datetime');

  const fmt = useMemo(
    () => ({
      time: new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: ISTANBUL_TZ }),
      datetime: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ISTANBUL_TZ }),
      day: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: ISTANBUL_TZ }),
    }),
    [tag],
  );

  const groups = useMemo(() => {
    if (!groupByDay) return [{ key: 'all', label: null as string | null, items: events }];
    const today = istanbulDay();
    const yesterday = addDays(today, -1);
    const out: Array<{ key: string; label: string | null; items: TimelineEvent[] }> = [];
    for (const e of events) {
      const d = toDate(e.at);
      const key = Number.isNaN(d.getTime()) ? 'invalid' : istanbulDay(d);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        const label = key === today ? copy.today : key === yesterday ? copy.yesterday : key === 'invalid' ? '—' : fmt.day.format(d);
        g = { key, label, items: [] };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  }, [events, groupByDay, copy.today, copy.yesterday, fmt]);

  if (!events.length) {
    return (
      <div ref={ref} className={cn('qx-small py-6 text-center text-fg-muted', className)} role="status">
        {emptyLabel ?? copy.timelineEmpty}
      </div>
    );
  }

  let index = 0;
  return (
    <div ref={ref} className={cn('min-w-0 space-y-5', className)}>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label ?? undefined} className="min-w-0">
          {g.label && <h3 className="qx-overline mb-2 text-fg-muted">{g.label}</h3>}
          <ol aria-label={g.label ? undefined : ariaLabel} className="relative min-w-0">
            {g.items.map((e, i) => {
              const d = toDate(e.at);
              const valid = !Number.isNaN(d.getTime());
              const Icon = e.icon ?? TONE_ICON[e.tone ?? 'neutral'];
              const isLast = i === g.items.length - 1;
              const itemIndex = index++;
              const content = (
                <>
                  {!isLast && <span aria-hidden className="absolute bottom-0 left-4 top-9 w-px -translate-x-1/2 bg-border" />}
                  <span
                    aria-hidden
                    className={cn('relative z-raised grid h-8 w-8 shrink-0 place-items-center rounded-full [&_svg]:h-4 [&_svg]:w-4', TONE_CHIP[e.tone ?? 'neutral'])}
                  >
                    <Icon strokeWidth={2} />
                  </span>
                  <div className={cn('min-w-0 flex-1', dense ? 'pb-3' : 'pb-5', isLast && 'pb-0')}>
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="qx-body min-w-0 font-medium text-fg">{e.title}</div>
                      <div className="flex shrink-0 items-center gap-2">
                        {e.meta}
                        {valid && (
                          <time
                            dateTime={d.toISOString()}
                            title={fmt.datetime.format(d)}
                            className="qx-caption qx-num whitespace-nowrap text-fg-subtle"
                          >
                            {style === 'time' ? fmt.time.format(d) : fmt.datetime.format(d)}
                          </time>
                        )}
                      </div>
                    </div>
                    {e.actor && <p className="qx-caption mt-0.5 text-fg-muted">{e.actor}</p>}
                    {e.description && <div className="qx-small mt-1 min-w-0 break-words text-fg-muted">{e.description}</div>}
                  </div>
                </>
              );
              return animate ? (
                <Motion.li key={e.id} variants={listItem} custom={itemIndex} initial="hidden" animate="visible" className="relative flex min-w-0 gap-3">
                  {content}
                </Motion.li>
              ) : (
                <li key={e.id} className="relative flex min-w-0 gap-3">
                  {content}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
});
