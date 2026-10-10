import { CheckCircle2, Play, Shuffle, Target, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Settled, TodayData } from '@/lib/play-hub/server';
import type { GameQuestDef } from '@/lib/play-hub/quests';
import { playHubCopy, type PlayLocale } from './copy';
import { ClaimButton } from './claim-button';
import { Meter } from './status-strip';
import { SectionError } from './section-error';
import { CHIP_CLASS, SECTION_CLASS } from './styles';

const ICONS: Record<GameQuestDef['icon'], typeof Play> = { play: Play, trophy: Trophy, shuffle: Shuffle };

/**
 * Günlük oyun görevleri: ilerleme bugünkü sıralı denemelerden (sunucu), ödül XP —
 * talep sunucuda yeniden doğrulanır ve tek-kez basılır (`/api/customer/games/quests`).
 */
export function DailyQuests({ locale, today }: { locale: PlayLocale; today: Settled<TodayData> }) {
  const c = playHubCopy(locale);
  return (
    <section aria-labelledby="hub-quests" className={SECTION_CLASS}>
      <div className="mb-3 space-y-1">
        <h2 id="hub-quests" className="flex items-center gap-2 qx-h3 text-fg">
          <Target className="size-5 text-brand" aria-hidden />
          {c.questsTitle}
        </h2>
        <p className="qx-small text-fg-muted">{c.questsDescription}</p>
      </div>
      {!today.ok ? (
        <SectionError locale={locale} kind={today.error} className="p-0" />
      ) : (
        <ul className="divide-y divide-border">
          {today.data.quests.map(({ quest, progress, done, claimed }) => {
            const Icon = ICONS[quest.icon];
            const title = locale === 'en' ? quest.titleEn : quest.title;
            const description = locale === 'en' ? quest.descriptionEn : quest.description;
            return (
              <li key={quest.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-control',
                      claimed ? 'bg-success-subtle text-success' : 'bg-brand-subtle text-brand'
                    )}
                  >
                    {claimed ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-2 qx-body font-semibold text-fg">
                      {title}
                      <span className={CHIP_CLASS}>+{quest.xp} XP</span>
                    </p>
                    <p className="qx-small text-fg-muted">{description}</p>
                    <div className="flex items-center gap-2">
                      <Meter
                        value={progress}
                        max={quest.target}
                        label={c.questProgressLabel(title, progress, quest.target)}
                        tone={done ? 'success' : 'brand'}
                        className="max-w-48"
                      />
                      <span className="qx-caption qx-num text-fg-muted">
                        {progress}/{quest.target}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="sm:shrink-0">
                  {claimed ? (
                    <span className="inline-flex min-h-11 items-center gap-1.5 qx-small font-semibold text-success">
                      <CheckCircle2 className="size-4" aria-hidden />
                      {c.questClaimed}
                    </span>
                  ) : done ? (
                    <ClaimButton
                      endpoint="/api/customer/games/quests"
                      body={{ questId: quest.id }}
                      label={c.questClaim}
                      pendingLabel={c.questClaiming}
                      successMessage={c.questDone(quest.xp)}
                      ariaLabel={`${title}: ${c.questClaim} (+${quest.xp} XP)`}
                    />
                  ) : (
                    <span className="inline-flex min-h-11 items-center qx-small text-fg-muted">{c.questInProgress}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
