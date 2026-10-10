'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, Gift, Info, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CountdownChip } from '@/components/ds/play';
import { QuestGlyph } from './quest-glyph';
import { QuestProgressBar, RewardChips } from './quest-row';
import { formatCount, type QuestCopy } from './copy';
import type { QuestDTO } from './types';

function formatDateTime(iso: string, locale: 'tr' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export interface QuestDetailSheetProps {
  quest: QuestDTO | null;
  onOpenChange: (open: boolean) => void;
  copy: QuestCopy;
  locale: 'tr' | 'en';
  claiming: boolean;
  claimDisabled: boolean;
  onClaim: (quest: QuestDTO) => void;
}

/**
 * Görev ayrıntısı (alt sayfa): açıklama, "nasıl ilerlerim", ilerlemeye götüren CTA, dönem/bitiş
 * bilgisi ve — tamamlandıysa — ödül alma. Bulgu 12–13 (kartlar tıklanabilir görünüp bir şey
 * yapmıyordu; ilerleme yolu yoktu).
 */
export function QuestDetailSheet({ quest, onOpenChange, copy, locale, claiming, claimDisabled, onClaim }: QuestDetailSheetProps) {
  return (
    <Sheet open={!!quest} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-sheet border-subtle bg-surface-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6"
      >
        {quest ? (
          <div className="space-y-5">
            <SheetHeader className="flex-row items-start gap-3 space-y-0 pr-10 text-left">
              <QuestGlyph icon={quest.icon} mechanic={quest.mechanic} state={quest.state} size="lg" />
              <div className="min-w-0 space-y-1">
                <SheetTitle className="qx-h3 text-fg">{quest.name}</SheetTitle>
                <SheetDescription className="qx-body text-fg-muted">{quest.description}</SheetDescription>
              </div>
            </SheetHeader>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="qx-small qx-num font-semibold text-fg">
                  {formatCount(quest.progress, locale)}/{formatCount(quest.target, locale)}
                </span>
                <RewardChips reward={quest.reward} copy={copy} locale={locale} muted={quest.state === 'claimed' || quest.state === 'auto_rewarded'} />
              </div>
              <div
                role="progressbar"
                aria-label={copy.progressAria(quest.name, quest.progress, quest.target)}
                aria-valuemin={0}
                aria-valuemax={quest.target}
                aria-valuenow={quest.progress}
              >
                <QuestProgressBar
                  value={quest.progress}
                  target={quest.target}
                  tone={quest.state === 'claimable' ? 'success' : quest.state === 'in_progress' ? 'brand' : 'muted'}
                />
              </div>
            </div>

            {quest.state === 'in_progress' ? (
              <section aria-labelledby="quest-howto" className="space-y-2 rounded-control bg-surface-2 p-4">
                <h3 id="quest-howto" className="qx-small inline-flex items-center gap-1.5 font-semibold text-fg">
                  <Info className="h-4 w-4 text-brand" aria-hidden />
                  {copy.howTo}
                </h3>
                <p className="qx-small text-fg-muted">{copy.mechanics[quest.mechanic]}</p>
                {quest.cta ? (
                  <Button asChild variant="outline" className="mt-1 min-h-11 w-full sm:w-auto">
                    <Link href={quest.cta.href} prefetch={false}>
                      {copy.cta[quest.cta.kind]}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </section>
            ) : null}

            {quest.rewardMode === 'auto' ? (
              <p className="qx-small flex items-start gap-2 text-fg-muted">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                {copy.autoNote}
              </p>
            ) : null}

            <div className="space-y-2">
              <p className="qx-caption flex items-start gap-2 text-fg-muted">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {copy.resetNote[quest.period]}
              </p>
              {quest.endsAt && quest.state !== 'claimed' && quest.state !== 'auto_rewarded' ? (
                <CountdownChip target={quest.endsAt} size="sm" label={copy.endsIn} />
              ) : null}
              {quest.claimDeadline && quest.state === 'claimable' ? (
                <p className="qx-caption text-warning">
                  {copy.claimUntil} {formatDateTime(quest.claimDeadline, locale)}
                </p>
              ) : null}
            </div>

            {quest.state === 'claimable' ? (
              <Button
                type="button"
                onClick={() => onClaim(quest)}
                disabled={claimDisabled}
                aria-busy={claiming || undefined}
                className="min-h-12 w-full bg-success text-success-fg shadow-none hover:bg-success/90"
              >
                {claiming ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Gift className="h-4 w-4" aria-hidden />}
                {claiming ? copy.claiming : copy.claim}
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
