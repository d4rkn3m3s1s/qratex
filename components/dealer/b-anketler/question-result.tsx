'use client';

import { useState } from 'react';
import { CheckSquare, CircleDot, Info, MessageSquareText, Star, TextCursorInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import type { SurveyQuestionSummary } from '@/lib/dealer-surveys/types';
import { formatNumber, formatPct, formatRelative, QUESTION_TYPE_LABEL, useSurveyCopy } from './copy';

const ICON = { single_choice: CircleDot, multiple_choice: CheckSquare, rating: Star, open_text: TextCursorInput } as const;

/** Oran çubuğu — görsel `aria-hidden`; değer satır metninde okunur (ilerleme çubuğu değil). */
function Bar({ pct, tone = 'brand' }: { pct: number; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' }) {
  const fill = { brand: 'bg-brand', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-fg-muted' }[tone];
  return (
    <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn('h-full rounded-full transition-[width] duration-slow ease-standard motion-reduce:transition-none', fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

const STAR_TONE = ['danger', 'warning', 'neutral', 'success', 'success'] as const;

export function QuestionResultCard({
  q,
  index,
  totalResponses,
  now,
  onSeeAllTexts,
}: {
  q: SurveyQuestionSummary;
  index: number;
  totalResponses: number;
  now: number;
  onSeeAllTexts: (q: SurveyQuestionSummary) => void;
}) {
  const { copy, locale, tag } = useSurveyCopy();
  const [order, setOrder] = useState<'survey' | 'count'>('survey');
  const headingId = `qres-${q.questionId}`;
  const known = q.type in ICON;
  const Icon = known ? ICON[q.type as keyof typeof ICON] : MessageSquareText;
  const typeLabel = known ? QUESTION_TYPE_LABEL[locale][q.type as keyof typeof ICON] : q.type;

  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 sm:p-5">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span aria-hidden className="qx-caption grid size-7 shrink-0 place-items-center rounded-chip bg-surface-3 font-semibold text-fg-muted tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="qx-body break-words font-semibold text-fg">
            {q.text}
          </h2>
          <p className="qx-caption mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Icon aria-hidden className="size-3.5" /> {typeLabel}
            </span>
            <span>{copy.answered(q.answered)}</span>
            {totalResponses > 0 && q.skipped > 0 && <span>{copy.skipped(q.skipped)}</span>}
            {!q.required && <span>{copy.optionalBadge}</span>}
          </p>
        </div>
      </header>

      <div className="mt-4">
        {q.options && (
          <ChoiceOptions q={q} order={order} onOrder={setOrder} />
        )}

        {q.rating && (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="text-center sm:pr-4" aria-label={q.rating.avg != null ? copy.ratingAria(formatNumber(q.rating.avg, tag, 1)) : undefined} role="img">
              <p className="text-4xl font-bold text-fg tabular-nums">
                {q.rating.avg != null ? formatNumber(q.rating.avg, tag, 1) : '—'}
                <span className="qx-small ml-1 font-normal text-fg-muted">{copy.outOfFive}</span>
              </p>
              <div aria-hidden className="mt-1 flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={cn('size-4', q.rating!.avg != null && s <= Math.round(q.rating!.avg) ? 'fill-warning text-warning' : 'text-fg-muted/60')} />
                ))}
              </div>
              <p className="qx-caption mt-1 text-fg-muted">{copy.satisfiedLine(formatPct(q.rating.satisfiedPct, tag))}</p>
            </div>
            <ul className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((s) => {
                const count = q.rating!.distribution[s - 1];
                const pct = q.answered > 0 ? (count / q.answered) * 100 : 0;
                const pctText = formatPct(q.answered > 0 ? Math.round(pct) : null, tag);
                return (
                  <li key={s} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-2" aria-label={copy.starRow(s, count, pctText)}>
                    <span aria-hidden className="qx-caption inline-flex items-center gap-0.5 text-fg-muted tabular-nums">
                      {s} <Star className="size-3" />
                    </span>
                    <Bar pct={pct} tone={STAR_TONE[s - 1]} />
                    <span aria-hidden className="qx-caption text-right text-fg-muted tabular-nums">
                      {count} · {pctText}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {q.texts && (
          <div className="space-y-2">
            {q.texts.length === 0 ? (
              <p className="qx-small text-fg-muted">{copy.noTexts}</p>
            ) : (
              <>
                <h3 className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">{copy.latestTexts}</h3>
                <ul className="space-y-2">
                  {q.texts.map((t, i) => (
                    <li key={`${t.at}-${i}`} className="rounded-control border border-subtle bg-surface-2 p-3">
                      <p className="qx-small whitespace-pre-line break-words text-fg">{t.text}</p>
                      <p className="qx-caption mt-1 text-fg-muted">
                        <time dateTime={t.at}>{formatRelative(t.at, tag, now)}</time>
                      </p>
                    </li>
                  ))}
                </ul>
                {q.answered > q.texts.length && (
                  <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => onSeeAllTexts(q)}>
                    {copy.seeAllTexts(q.answered)}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {q.ignoredAnswers > 0 && (
        <p className="qx-caption mt-3 flex items-start gap-1.5 text-fg-muted">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" /> {copy.ignored(q.ignoredAnswers)}
        </p>
      )}
    </section>
  );
}

function ChoiceOptions({ q, order, onOrder }: { q: SurveyQuestionSummary; order: 'survey' | 'count'; onOrder: (o: 'survey' | 'count') => void }) {
  const { copy, tag } = useSurveyCopy();
  const rows = order === 'count' ? [...q.options!].sort((a, b) => b.count - a.count) : q.options!;
  const max = Math.max(0, ...q.options!.map((o) => o.count));
  if (q.options!.length === 0) return <p className="qx-small text-fg-muted">{copy.hiddenQuestion}</p>;
  return (
    <div className="space-y-3">
      {q.options!.length > 2 && (
        <ChoiceChips
          aria-label={copy.sortToggleLabel}
          size="sm"
          value={order}
          onChange={(v) => v && onOrder(v as 'survey' | 'count')}
          options={[
            { value: 'survey', label: copy.sortByOrder },
            { value: 'count', label: copy.sortByCount },
          ]}
        />
      )}
      <ul className="space-y-2.5">
        {rows.map((o) => {
          const pct = q.answered > 0 ? (o.count / q.answered) * 100 : 0;
          const pctText = formatPct(q.answered > 0 ? Math.round(pct) : null, tag);
          return (
            <li key={o.label} aria-label={copy.optionRow(o.label, o.count, pctText)} className="space-y-1">
              <div aria-hidden className="flex items-baseline justify-between gap-3">
                <span className={cn('qx-small min-w-0 break-words text-fg', o.count === max && max > 0 && 'font-semibold')}>{o.label}</span>
                <span className="qx-caption shrink-0 text-fg-muted tabular-nums">
                  {o.count} · {pctText}
                </span>
              </div>
              <Bar pct={pct} tone={o.count === max && max > 0 ? 'brand' : 'neutral'} />
            </li>
          );
        })}
      </ul>
      {q.type === 'multiple_choice' && <p className="qx-caption text-fg-muted">{copy.multiHint}</p>}
    </div>
  );
}
