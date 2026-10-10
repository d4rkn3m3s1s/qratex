'use client';

import { useEffect, useRef } from 'react';
import { Star } from 'lucide-react';
import { useReducedMotionPref } from '@/lib/motion';
import { isChoiceType } from '@/lib/survey-schema';
import { cn } from '@/lib/utils';
import type { BuilderDraft } from './builder-model';
import { useSurveyCopy } from './copy';

/**
 * Canlı müşteri görünümü (telefon çerçevesi) — salt görsel, odaklanabilir öğe içermez (klavye
 * kullanıcısı düzenleyiciden ayrılmaz). Düzenlenen soru vurgulanır ve görünür alana kaydırılır
 * (azaltılmış harekette anında). Boş seçenek satırları müşteriye gitmeyeceği için gösterilmez.
 */
export function SurveyPreview({ draft, activeQuestionId }: { draft: BuilderDraft; activeQuestionId: string | null }) {
  const { copy } = useSurveyCopy();
  const reduce = useReducedMotionPref();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeQuestionId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-preview-q="${activeQuestionId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [activeQuestionId, reduce]);

  const questions = draft.questions.filter((q) => q.text.trim() || (isChoiceType(q.type) && q.options.some((o) => o.value.trim())));

  return (
    <section aria-labelledby="survey-preview-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="survey-preview-heading" className="qx-small font-semibold text-fg">
          {copy.previewHeading}
        </h2>
        <span className="qx-caption text-fg-muted">{copy.previewNote}</span>
      </div>
      <div className="mx-auto w-full max-w-[380px] rounded-[2rem] border-[6px] border-surface-3 bg-surface-0 p-1 qx-elevation-1">
        <div ref={scrollRef} role="region" tabIndex={0} aria-label={copy.previewHeading} className="max-h-[68dvh] overflow-y-auto rounded-[1.5rem] bg-surface-1 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <div className="space-y-1 border-b border-subtle pb-3">
            <p className={cn('qx-h3 break-words', draft.title.trim() ? 'text-fg' : 'text-fg-muted')}>{draft.title.trim() || copy.previewUntitled}</p>
            {draft.description.trim() && <p className="qx-small whitespace-pre-line break-words text-fg-muted">{draft.description.trim()}</p>}
          </div>

          {questions.length === 0 ? (
            <p className="qx-small py-8 text-center text-fg-muted">{copy.previewEmpty}</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {questions.map((q, i) => {
                const opts = q.options.map((o) => o.value.trim()).filter(Boolean);
                return (
                  <li
                    key={q.id}
                    data-preview-q={q.id}
                    className={cn(
                      'rounded-control p-2 transition-colors duration-fast',
                      activeQuestionId === q.id && 'bg-brand-subtle ring-1 ring-inset ring-brand-border',
                    )}
                  >
                    <p className="qx-small break-words font-medium text-fg">
                      {i + 1}. {q.text.trim() || '…'}
                      {q.required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
                    </p>
                    {q.type === 'multiple_choice' && <p className="qx-caption text-fg-muted">{copy.previewMulti}</p>}
                    {isChoiceType(q.type) && (
                      <ul className="mt-2 space-y-1.5">
                        {opts.map((o, oi) => (
                          <li key={`${o}-${oi}`} className="qx-small flex items-center gap-2 rounded-control border border-subtle px-3 py-2 text-fg">
                            <span aria-hidden className={cn('size-4 shrink-0 border border-strong', q.type === 'single_choice' ? 'rounded-full' : 'rounded-sm')} />
                            <span className="break-words">{o}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.type === 'rating' && (
                      <div className="mt-2 flex gap-1" aria-hidden>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className="size-7 text-fg-muted" />
                        ))}
                      </div>
                    )}
                    {q.type === 'open_text' && (
                      <div className="qx-small mt-2 min-h-16 rounded-control border border-subtle px-3 py-2 text-fg-muted">{copy.previewOpenText}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-5 grid h-11 place-items-center rounded-control bg-brand text-sm font-semibold text-brand-fg opacity-90">{copy.previewSubmit}</div>
        </div>
      </div>
    </section>
  );
}
