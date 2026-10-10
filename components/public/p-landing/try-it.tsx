'use client';

import { useId, useState } from 'react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatingInput } from '@/components/ds/a11y/rating-input';
import { previewFeedbackReward, type EarnPreview } from '@/lib/landing/earn-preview-core';
import { fadeIn } from '@/lib/motion/variants';
import { CtaLink } from './cta-link';
import { fmt, formatInt, type PublicLocale } from './fmt';
import type { LandingCopy } from './landing-copy';

const MAX_LEN = 600;

/**
 * Etkileşimli "kaç puan eder?" deneme alanı (eski yer tutucu Demo bölümünün yerine,
 * landing.md envanter #22/#32/#33). Hiçbir şey göndermez; ekonominin GERÇEK kuralını
 * (`previewFeedbackReward`, sunucudaki puan matrisi değerleriyle) canlı uygular.
 * Sonuç `aria-live` ile duyurulur.
 */
export function TryIt({
  copy,
  feedback,
  locale,
}: {
  copy: LandingCopy['tryIt'];
  feedback: EarnPreview['feedback'];
  locale: PublicLocale;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const textId = useId();
  const counterId = useId();
  const ratingLabelId = useId();

  const length = text.trim().length;
  const reward = previewFeedbackReward(text, feedback);
  const remaining = Math.max(0, feedback.longTextThreshold - length);

  return (
    <div className="grid gap-6 rounded-sheet border border-subtle bg-surface-1/85 p-5 shadow-sm backdrop-blur-md sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()} aria-describedby={counterId}>
        <div>
          <p id={ratingLabelId} className="mb-2 text-sm font-medium text-fg">
            {copy.ratingLabel}
          </p>
          <RatingInput aria-labelledby={ratingLabelId} value={rating} onChange={setRating} size="lg" register="play" />
        </div>
        <div>
          <label htmlFor={textId} className="mb-2 block text-sm font-medium text-fg">
            {copy.textLabel}
          </label>
          <textarea
            id={textId}
            value={text}
            maxLength={MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={copy.textPlaceholder}
            aria-describedby={counterId}
            className="w-full resize-y rounded-control border border-strong bg-surface-0 px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p id={counterId} className="qx-num text-xs text-fg-muted">
              {fmt(copy.counter, { n: formatInt(length, locale), threshold: formatInt(feedback.longTextThreshold, locale) })}
            </p>
            {(rating !== null || text) && (
              <Button
                type="button"
                variant="ghost"
                className="text-fg-muted"
                onClick={() => {
                  setRating(null);
                  setText('');
                }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                {copy.reset}
              </Button>
            )}
          </div>
          {/* Eşiğe ilerleme */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/10" aria-hidden>
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-base ease-standard"
              style={{ width: `${Math.min(100, Math.round((length / Math.max(1, feedback.longTextThreshold)) * 100))}%` }}
            />
          </div>
        </div>
      </form>

      <div className="flex flex-col justify-between gap-5 rounded-card border border-brand-border bg-brand-subtle p-5 sm:p-6">
        <div aria-live="polite" aria-atomic="true" className="min-h-[7.5rem]">
          <AnimatePresence mode="wait" initial={false}>
            {rating === null ? (
              <Motion.p key="idle" variants={fadeIn} initial="hidden" animate="visible" exit="exit" className="text-sm text-fg-muted">
                {copy.resultIdle}
              </Motion.p>
            ) : (
              <Motion.div key={`r-${reward.points}`} variants={fadeIn} initial="hidden" animate="visible" exit="exit">
                <p className="flex items-baseline gap-2">
                  <Sparkles className="h-5 w-5 shrink-0 self-center text-brand" aria-hidden />
                  <span className="qx-num text-4xl font-bold tracking-tight text-fg">+{formatInt(reward.points, locale)}</span>
                  <span className="text-base font-medium text-fg-muted">{copy.pointsUnit}</span>
                </p>
                <p className="mt-2 text-sm text-fg">
                  {fmt(copy.result, { points: formatInt(reward.points, locale), xp: formatInt(reward.xp, locale) })}
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-sm text-fg-muted">
                  {reward.detailed ? (
                    <>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      {copy.detailedDone}
                    </>
                  ) : (
                    fmt(copy.detailedHint, {
                      remaining: formatInt(remaining, locale),
                      detailed: formatInt(feedback.detailed.points, locale),
                    })
                  )}
                </p>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
        <Button asChild size="lg" variant="gradient" className="w-full">
          <CtaLink href="/auth/register?role=CUSTOMER&src=landing_try" cta="try_join" page="landing">
            {copy.cta}
            <ArrowRight className="h-5 w-5" aria-hidden />
          </CtaLink>
        </Button>
      </div>
    </div>
  );
}
