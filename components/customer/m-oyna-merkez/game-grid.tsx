import Link from 'next/link';
import { CheckCircle2, CircleSlash, Dumbbell, Hourglass, HelpCircle, Medal, Play, type LucideIcon } from 'lucide-react';
import { EmptyState, InlineError } from '@/components/states';
import { Reveal } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { todayStateOf, type HubGame, type TodayEntry, type TodayState } from '@/lib/play-hub/catalog';
import { playHubCopy, type PlayHubCopy, type PlayLocale } from './copy';
import { CHIP_CLASS } from './styles';

export type HubMode = 'ranked' | 'practice';

const STATE_ORDER: Record<TodayState, number> = { available: 0, unfinished: 1, won: 2, lost: 3 };

function stateMeta(state: TodayState | null, c: PlayHubCopy): { label: string; icon: LucideIcon; tone: string } {
  switch (state) {
    case 'won':
      return { label: c.stateWon, icon: CheckCircle2, tone: 'bg-success-subtle text-success ring-success-border' };
    case 'lost':
      return { label: c.stateLost, icon: CircleSlash, tone: 'bg-surface-2 text-fg-muted ring-border' };
    case 'unfinished':
      return { label: c.stateUnfinished, icon: Hourglass, tone: 'bg-warning-subtle text-warning ring-warning-border' };
    case 'available':
      return { label: c.stateAvailable, icon: Play, tone: 'bg-brand-subtle text-brand ring-brand-border' };
    default:
      return { label: c.stateUnknown, icon: HelpCircle, tone: 'bg-surface-2 text-fg-muted ring-border' };
  }
}

/** Sıralı / Pratik seçimi — bağlantı tabanlı (URL'de `?kip=pratik`), JS gerektirmez. */
export function ModeSwitch({ locale, mode }: { locale: PlayLocale; mode: HubMode }) {
  const c = playHubCopy(locale);
  const items: { value: HubMode; href: string; label: string; hint: string; icon: LucideIcon }[] = [
    { value: 'ranked', href: '/customer/games', label: c.modeRanked, hint: c.modeRankedHint, icon: Medal },
    { value: 'practice', href: '/customer/games?kip=pratik', label: c.modePractice, hint: c.modePracticeHint, icon: Dumbbell },
  ];
  return (
    <nav aria-label={c.modeLabel}>
      <ul className="grid grid-cols-2 gap-1 rounded-control border border-border bg-surface-1 p-1 sm:inline-grid">
        {items.map(({ value, href, label, hint, icon: Icon }) => {
          const active = value === mode;
          return (
            <li key={value}>
              <Link
                href={href}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 flex-col items-start justify-center rounded-chip px-3 py-1.5',
                  'transition-colors duration-fast ease-standard',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  active ? 'bg-brand text-brand-fg' : 'text-fg hover:bg-surface-2'
                )}
              >
                <span className="flex items-center gap-1.5 qx-small font-semibold">
                  <Icon className="size-4" aria-hidden />
                  {label}
                </span>
                <span className={cn('qx-caption', active ? 'text-brand-fg' : 'text-fg-muted')}>{hint}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Oyun ızgarası. Sıralı modda kart başına bugünkü durum (Kazandın / Hak kullanıldı /
 * Yarım kaldı / Oynanmadı), ödül ve eşik, kişisel en iyi; oynanmamışlar önce. Pratik
 * modunda yalnız pratik destekli oyunlar oynanabilir (ödülsüz).
 */
export function GameGrid({
  locale,
  mode,
  games,
  today,
  todayFailed,
  bests,
}: {
  locale: PlayLocale;
  mode: HubMode;
  games: readonly HubGame[];
  /** null → bugünkü durum alınamadı (kartlar durumsuz gösterilir, "Oyna" varsayılmaz). */
  today: ReadonlyMap<string, TodayEntry> | null;
  todayFailed: boolean;
  bests: ReadonlyMap<string, number> | null;
}) {
  const c = playHubCopy(locale);

  if (games.length === 0) {
    // Sunucu bileşeni: istemci EmptyState'e ikon bileşeni geçilemez (RSC serileştirme) → varyant ikonu.
    return <EmptyState variant="first-use" title={c.gamesEmptyTitle} description={c.gamesEmptyBody} headingLevel="h3" />;
  }

  if (mode === 'practice' && !games.some((g) => g.practice)) {
    return (
      <EmptyState
        variant="filtered"
        title={c.practiceEmptyTitle}
        description={c.practiceEmptyBody}
        headingLevel="h3"
        action={
          <Link
            href="/customer/games"
            className="inline-flex min-h-11 items-center rounded-control bg-brand px-4 qx-small font-semibold text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {c.modeRanked}
          </Link>
        }
      />
    );
  }

  const indexed = games.map((g, i) => ({ g, i }));
  const sorted =
    mode === 'practice'
      ? indexed.sort((a, b) => Number(b.g.practice) - Number(a.g.practice) || a.i - b.i)
      : today
        ? indexed.sort(
            (a, b) =>
              STATE_ORDER[todayStateOf(today, a.g.gameType) ?? 'available'] -
                STATE_ORDER[todayStateOf(today, b.g.gameType) ?? 'available'] || a.i - b.i
          )
        : indexed;

  return (
    <div className="space-y-3">
      {todayFailed && mode === 'ranked' && (
        <InlineError variant="banner" tone="warning">
          {c.todayError}
        </InlineError>
      )}
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {sorted.map(({ g }, idx) => {
          const state = mode === 'ranked' ? todayStateOf(today, g.gameType) : null;
          const entry = today?.get(g.gameType);
          const best = bests?.get(g.gameType) ?? null;
          const practiceBlocked = mode === 'practice' && !g.practice;
          const meta = stateMeta(state, c);
          const StateIcon = meta.icon;
          const href = mode === 'practice' ? `${g.href}?kip=pratik` : g.href;
          const stateLabel = mode === 'practice' ? (g.practice ? c.practiceChip : c.practiceUnavailable) : meta.label;

          const body = (
            <>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-12 shrink-0 place-items-center rounded-control text-3xl leading-none"
                  style={{ background: `color-mix(in oklab, ${g.accent} 20%, transparent)` }}
                >
                  {g.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate qx-body font-semibold text-fg">{g.title}</h3>
                  <p className="line-clamp-2 qx-small text-fg-muted">{g.description}</p>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                {mode === 'ranked' ? (
                  <>
                    <span className={cn(CHIP_CLASS, 'ring-1 ring-inset', meta.tone)}>
                      <StateIcon className="size-3.5" aria-hidden />
                      {meta.label}
                    </span>
                    <span className={CHIP_CLASS}>{c.rewardChip(g.rewardPoints, g.rewardXp)}</span>
                    {entry && entry.state !== 'unfinished' && <span className={CHIP_CLASS}>{c.todayScore(entry.score)}</span>}
                    {best != null && best > 0 && <span className={CHIP_CLASS}>{c.personalBest(best)}</span>}
                  </>
                ) : (
                  <span className={cn(CHIP_CLASS, g.practice && 'bg-info-subtle text-info ring-info-border')}>
                    <Dumbbell className="size-3.5" aria-hidden />
                    {stateLabel}
                  </span>
                )}
              </div>
              {mode === 'ranked' && state === 'unfinished' && (
                <p className="qx-caption text-fg-muted">{c.stateUnfinishedHint}</p>
              )}
              {g.mergesInto && <p className="qx-caption text-fg-muted">{c.classicNote(g.mergesInto)}</p>}
            </>
          );

          const cardClass =
            'flex h-full flex-col gap-2 rounded-card border border-border bg-surface-1 p-4 qx-elevation-1';

          return (
            <Reveal key={g.gameType} as="li" index={Math.min(idx, 11)} className="h-full">
              {practiceBlocked ? (
                <div className={cn(cardClass, 'opacity-80')}>
                  {body}
                </div>
              ) : (
                <Link
                  href={href}
                  aria-label={
                    mode === 'ranked'
                      ? c.cardAria(g.title, `${stateLabel}, ${c.rewardChip(g.rewardPoints, g.rewardXp)}`)
                      : c.cardAria(g.title, stateLabel)
                  }
                  className={cn(
                    cardClass,
                    'transition-[border-color,box-shadow,transform] duration-base ease-standard',
                    'hover:-translate-y-0.5 hover:border-strong motion-reduce:hover:translate-y-0',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                  )}
                >
                  {body}
                </Link>
              )}
            </Reveal>
          );
        })}
      </ul>
    </div>
  );
}
