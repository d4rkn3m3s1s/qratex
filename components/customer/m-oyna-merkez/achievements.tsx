import { Award, ChevronDown } from 'lucide-react';
import { BadgeGlyph, RarityBadge } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import type { AchievementProgress } from '@/lib/game-achievements';
import type { AchievementsData, Settled } from '@/lib/play-hub/server';
import { playHubCopy, type PlayLocale } from './copy';
import { Meter } from './status-strip';
import { SectionError } from './section-error';
import { CHIP_CLASS, SECTION_CLASS } from './styles';

function Row({ a, locale }: { a: AchievementProgress; locale: PlayLocale }) {
  const c = playHubCopy(locale);
  return (
    <li className="flex items-start gap-3 rounded-control border border-border bg-surface-1 p-3">
      <BadgeGlyph label={a.title} emoji={a.icon} rarity={a.rarity} locked={!a.unlocked} size="md" locale={locale} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-1.5 qx-small font-semibold text-fg">
          {a.title}
          <RarityBadge rarity={a.rarity} size="sm" locale={locale} />
        </p>
        <p className="qx-caption text-fg-muted">{a.description}</p>
        {!a.unlocked && (
          <div className="flex items-center gap-2">
            <Meter value={a.progress} max={a.target} label={`${a.title}: ${c.achievementProgress(a.progress, a.target)}`} className="max-w-40" />
            <span className="qx-caption qx-num text-fg-muted">{c.achievementProgress(a.progress, a.target)}</span>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Oyun başarımları: lobide yalnız EN YAKIN 3 kilitli başarım (ilerlemeye göre) + açılan
 * sayısı; tam liste katlanır bölümde (JS'siz `<details>`). Nadirlik etiketleri Türkçe.
 */
export function Achievements({ locale, data }: { locale: PlayLocale; data: Settled<AchievementsData> }) {
  const c = playHubCopy(locale);
  return (
    <section aria-labelledby="hub-ach" className={SECTION_CLASS}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="hub-ach" className="flex items-center gap-2 qx-h3 text-fg">
          <Award className="size-5 text-brand" aria-hidden />
          {c.achievementsTitle}
        </h2>
        {data.ok && <span className={CHIP_CLASS}>{c.achievementsCount(data.data.unlocked, data.data.total)}</span>}
      </div>
      {!data.ok ? (
        <SectionError locale={locale} kind={data.error} className="p-0" />
      ) : (
        (() => {
          const locked = data.data.list
            .filter((a) => !a.unlocked)
            .sort((x, y) => y.pct - x.pct || x.target - y.target)
            .slice(0, 3);
          return (
            <div className="space-y-3">
              {locked.length === 0 ? (
                <p className="qx-small font-semibold text-success">{c.achievementsAllDone}</p>
              ) : (
                <>
                  <p className="qx-small text-fg-muted">{c.achievementsNearest}</p>
                  <ul className="grid gap-2 md:grid-cols-3">
                    {locked.map((a) => (
                      <Row key={a.id} a={a} locale={locale} />
                    ))}
                  </ul>
                </>
              )}
              <details className="group">
                <summary
                  className={cn(
                    'inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control px-2 qx-small font-semibold text-brand',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden'
                  )}
                >
                  <ChevronDown className="size-4 transition-transform duration-fast group-open:rotate-180" aria-hidden />
                  {c.achievementsAll}
                </summary>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.data.list.map((a) => (
                    <Row key={a.id} a={a} locale={locale} />
                  ))}
                </ul>
              </details>
            </div>
          );
        })()
      )}
    </section>
  );
}
