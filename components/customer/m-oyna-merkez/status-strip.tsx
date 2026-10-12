import type { ReactNode } from 'react';
import { CalendarClock, Coins, Flame } from 'lucide-react';
import { CountdownChip } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { EarningsData, Settled, TodayData } from '@/lib/play-hub/server';
import { streakBonusXp, type StreakSummary } from '@/lib/play-hub/catalog';
import { playHubCopy, type PlayLocale } from './copy';
import { SectionError } from './section-error';

/** Şeridin tek hücresi: küçük etiket → büyük sayı → ölçer. Kart değil; ortak panelin bölmesi. */
function Cell({ title, short, icon, children }: { title: string; short: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-1.5 px-3 py-3 first:pl-0 last:pr-0 sm:px-5 sm:py-1">
      <h2 className="flex min-w-0 items-center gap-1.5 qx-caption font-medium text-fg-muted">
        {icon}
        <span className="truncate sm:hidden" aria-hidden>{short}</span>
        <span className="sr-only sm:not-sr-only sm:truncate">{title}</span>
      </h2>
      {children}
    </section>
  );
}

/** Büyük sayı + sönük payda ("0 / 600 puan" tek satırda sıkışmasın). */
function Figure({ value, rest }: { value: number | string; rest?: string }) {
  return (
    <p className="flex min-w-0 items-baseline gap-1 font-display qx-num leading-none text-fg">
      <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</span>
      {rest ? <span className="truncate qx-caption text-fg-muted">{rest}</span> : null}
    </p>
  );
}

/** Yatay ilerleme çubuğu (role=progressbar; yalnız renge dayanmaz — yanında sayı var). */
export function Meter({
  value,
  max,
  label,
  tone = 'brand',
  className,
}: {
  value: number;
  max: number;
  label: string;
  tone?: 'brand' | 'success' | 'warning';
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={cn(
          'qx-fx-fill h-full rounded-full transition-[width] duration-slow ease-standard',
          tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-brand'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Lobinin üst şeridi: oyun serisi · bugünkü denemeler (+ yenilenme sayacı) · bugünkü oyun
 * puanı / tavan. Her kutu kendi verisine bağlıdır; biri düşerse yalnız o kutu hata gösterir.
 */
export function StatusStrip({
  locale,
  streak,
  today,
  earnings,
  totalGames,
}: {
  locale: PlayLocale;
  streak: Settled<StreakSummary>;
  today: Settled<TodayData>;
  earnings: Settled<EarningsData>;
  totalGames: number;
}) {
  const c = playHubCopy(locale);
  const used = today.ok ? [...today.data.entries.keys()].length : 0;

  const capped = earnings.ok && earnings.data.today >= earnings.data.dailyCap;
  const streakLine = streak.ok
    ? streak.data.wonToday
      ? c.streakSafe(streak.data.current)
      : streak.data.atRisk
        ? c.streakAtRisk(streak.data.current)
        : c.streakNone
    : null;

  // Tek panel, üç bölme: eskiden üç eşit ağırlıkta kart mobilde oyunları ekranın altına itiyordu.
  // Sayılar öne, açıklamalar tek bir alt satıra (yalnız durum değişince önemli olan seri mesajı).
  return (
    <div className="rounded-card border border-border bg-surface-1 px-4 py-2 qx-elevation-1 sm:py-4">
      <div className="grid grid-cols-3 divide-x divide-border">
        <Cell title={c.streakTitle} short={c.streakShort} icon={<Flame className="qx-fx-flame size-3.5 shrink-0 text-warning" aria-hidden />}>
          {streak.ok ? (
            <>
              <Figure value={streak.data.current} rest={c.streakUnit} />
              <p className="truncate qx-caption text-fg-muted">{c.streakLongest(streak.data.longest)}</p>
            </>
          ) : (
            <SectionError locale={locale} kind={streak.error} className="p-0" />
          )}
        </Cell>

        <Cell title={c.attemptsTitle} short={c.attemptsShort} icon={<CalendarClock className="size-3.5 shrink-0 text-brand" aria-hidden />}>
          {today.ok ? (
            <>
              <Figure value={Math.min(used, totalGames)} rest={`/ ${totalGames}`} />
              <Meter value={Math.min(used, totalGames)} max={Math.max(totalGames, 1)} label={c.attemptsTitle} className="h-1.5" />
            </>
          ) : (
            <SectionError locale={locale} kind={today.error} className="p-0" />
          )}
        </Cell>

        <Cell title={c.earningsTitle} short={c.earningsShort} icon={<Coins className="size-3.5 shrink-0 text-warning" aria-hidden />}>
          {earnings.ok ? (
            <>
              <Figure value={earnings.data.today} rest={`/ ${earnings.data.dailyCap}`} />
              <Meter
                value={earnings.data.today}
                max={earnings.data.dailyCap}
                label={c.earningsTitle}
                tone={capped ? 'warning' : 'success'}
                className="h-1.5"
              />
            </>
          ) : (
            <SectionError locale={locale} kind={earnings.error} className="p-0" />
          )}
        </Cell>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border py-2.5 sm:mt-3 sm:pb-0 sm:pt-3">
        {today.ok ? <CountdownChip target={today.data.resetAt} label={c.resetIn} size="sm" locale={locale} /> : null}
        {streakLine ? (
          <p className={cn('min-w-0 flex-1 qx-caption', streak.ok && streak.data.atRisk ? 'font-medium text-warning' : 'text-fg-muted')}>
            {streakLine}
            {streak.ok && !streak.data.wonToday ? (
              <span className="hidden sm:inline"> {c.streakNext(streak.data.nextLength, streakBonusXp(streak.data.nextLength))}</span>
            ) : null}
          </p>
        ) : null}
        {capped ? <p className="w-full qx-caption font-medium text-warning">{c.earningsCapped}</p> : null}
        {earnings.ok ? (
          <p className="hidden w-full qx-caption text-fg-muted sm:block">
            {c.earningsHint(earnings.data.week, earnings.data.weeklyCap)} · {c.attemptsHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
