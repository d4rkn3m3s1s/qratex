import { Check, Sparkles } from 'lucide-react';
import { CountdownChip, GlowCard } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import { PASS_TIERS, seasonLabel } from '@/lib/play-hub/pass';
import type { PassData, Settled } from '@/lib/play-hub/server';
import { playHubCopy, type PlayLocale } from './copy';
import { Meter } from './status-strip';
import { SectionError } from './section-error';

/**
 * Oyun Pasosu: bu ay (İstanbul) oyunlardan kazanılan XP ile ilerleyen sezonluk yol.
 * Değer defterden türetilir (lib/play-hub/pass). Kademeler statüdür; ödül vaat edilmez.
 */
export function GamePass({ locale, data }: { locale: PlayLocale; data: Settled<PassData> }) {
  const c = playHubCopy(locale);
  return (
    <GlowCard accent="category-1" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 id="hub-pass" className="flex items-center gap-2 qx-h3 text-fg">
            <Sparkles className="size-5 text-brand" aria-hidden />
            {c.passTitle}
          </h2>
          {data.ok && <p className="qx-small text-fg-muted">{c.passSeason(seasonLabel(data.data.season, locale))}</p>}
        </div>
        {data.ok && <CountdownChip target={data.data.season.end} label={c.passEndsIn} size="sm" locale={locale} />}
      </div>

      {!data.ok ? (
        <SectionError locale={locale} kind={data.error} className="p-0" />
      ) : (
        <>
          <p className="qx-small text-fg-muted">{c.passDescription}</p>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="font-display qx-h2 qx-num text-fg">{c.passXp(data.data.progress.xp)}</p>
            <p className="qx-small font-semibold text-brand">
              {data.data.progress.tier > 0
                ? c.passTier(
                    data.data.progress.tier,
                    locale === 'en'
                      ? PASS_TIERS[data.data.progress.tier - 1].nameEn
                      : PASS_TIERS[data.data.progress.tier - 1].name
                  )
                : c.passNoTier}
            </p>
          </div>
          <Meter
            value={data.data.progress.pctToNext}
            max={100}
            label={c.passAria(data.data.progress.xp, data.data.progress.tier)}
          />
          <p className="qx-small text-fg-muted">
            {data.data.progress.next
              ? c.passToNext(
                  data.data.progress.toNext,
                  locale === 'en' ? data.data.progress.next.nameEn : data.data.progress.next.name
                )
              : c.passMax}
          </p>

          <ol
            aria-labelledby="hub-pass"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
          >
            {PASS_TIERS.map((t) => {
              const reached = data.data.progress.tier >= t.level;
              const isNext = data.data.progress.next?.level === t.level;
              return (
                <li
                  key={t.level}
                  className={cn(
                    'flex w-20 shrink-0 flex-col items-center gap-1 rounded-control border p-2 text-center',
                    reached
                      ? 'border-brand-border bg-brand-subtle'
                      : isNext
                        ? 'border-strong bg-surface-1'
                        : 'border-border bg-surface-1'
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 place-items-center rounded-full qx-small font-bold qx-num',
                      reached ? 'bg-brand text-brand-fg' : 'bg-surface-3 text-fg-muted'
                    )}
                  >
                    {reached ? <Check className="size-4" aria-hidden /> : t.level}
                    {reached && <span className="sr-only">{t.level}</span>}
                  </span>
                  <span className={cn('qx-caption font-semibold', reached ? 'text-brand' : 'text-fg')}>
                    {locale === 'en' ? t.nameEn : t.name}
                  </span>
                  <span className="qx-caption qx-num text-fg-muted">{t.xp} XP</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </GlowCard>
  );
}
