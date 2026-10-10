'use client';

import { memo } from 'react';
import { ArrowDown, ArrowUp, CheckSquare, CircleDot, Copy, Lock, Plus, Star, TextCursorInput, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { isChoiceType, SURVEY_LIMITS, SURVEY_QUESTION_TYPES, type SurveyQuestionType } from '@/lib/survey-schema';
import type { QuestionErrors } from '@/lib/survey-draft';
import type { BuilderQuestion } from './builder-model';
import { QUESTION_TYPE_LABEL, useSurveyCopy } from './copy';

const TYPE_ICON: Record<SurveyQuestionType, typeof CircleDot> = {
  single_choice: CircleDot,
  multiple_choice: CheckSquare,
  rating: Star,
  open_text: TextCursorInput,
};

export type QuestionEditorHandlers = {
  onText: (qid: string, text: string) => void;
  onType: (qid: string, type: SurveyQuestionType) => void;
  onRequired: (qid: string, required: boolean) => void;
  onOption: (qid: string, oid: string, value: string) => void;
  onAddOption: (qid: string, afterOid?: string) => void;
  onRemoveOption: (qid: string, oid: string) => void;
  onMove: (qid: string, dir: -1 | 1) => void;
  onDuplicate: (qid: string) => void;
  onRemove: (qid: string) => void;
  onActive: (qid: string) => void;
};

/**
 * Tek soru kartı. Erişilebilirlik: `fieldset` + gizli `legend`, her denetimin bağlamlı adı
 * ("Soru 3'ü sil"), hata metinleri `aria-describedby` ile bağlı, ≥ 44px dokunma hedefleri.
 * Yanıt almış (kilitli) soruda tip ve mevcut seçenekler salt okunur; nedeni metinle yazılır.
 */
export const QuestionEditor = memo(function QuestionEditor({
  q,
  index,
  total,
  errors,
  canAddQuestion,
  h,
}: {
  q: BuilderQuestion;
  index: number;
  total: number;
  errors: QuestionErrors;
  canAddQuestion: boolean;
  h: QuestionEditorHandlers;
}) {
  const { copy, locale } = useSurveyCopy();
  const n = index + 1;
  const textId = `${q.id}-text`;
  const lockNoteId = `${q.id}-lock`;
  const hasError = !!(errors.text || errors.options || errors.type || errors.other || (errors.option && Object.keys(errors.option).length));
  const choice = isChoiceType(q.type);
  const removableOptions = q.options.filter((o) => !o.locked).length;
  const TypeIcon = TYPE_ICON[q.type];

  return (
    <fieldset
      onFocusCapture={() => h.onActive(q.id)}
      className={cn('min-w-0 rounded-card border bg-surface-1 p-4 qx-elevation-1 sm:p-5', hasError ? 'border-danger-border' : 'border-subtle')}
    >
      <legend className="sr-only">{copy.questionLabel(n)}</legend>

      {/* Üst satır: numara + tip + kart eylemleri */}
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="qx-caption grid size-7 shrink-0 place-items-center rounded-chip bg-surface-3 font-semibold text-fg-muted tabular-nums">
          {n}
        </span>
        <div className="min-w-0 flex-1 sm:flex-none">
          <Select value={q.type} onValueChange={(v) => h.onType(q.id, v as SurveyQuestionType)} disabled={q.locked}>
            <SelectTrigger className="h-11 w-full sm:w-56" aria-label={copy.typeLabel(n)} aria-describedby={q.locked ? lockNoteId : undefined}>
              <span className="flex min-w-0 items-center gap-2">
                <TypeIcon aria-hidden className="size-4 shrink-0 text-brand" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {SURVEY_QUESTION_TYPES.map((k) => (
                <SelectItem key={k} value={k} className="min-h-11">
                  {QUESTION_TYPE_LABEL[locale][k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconButton aria-label={copy.moveUp(n)} icon={<ArrowUp />} variant="ghost" disabled={index === 0} onClick={() => h.onMove(q.id, -1)} />
          <IconButton aria-label={copy.moveDown(n)} icon={<ArrowDown />} variant="ghost" disabled={index === total - 1} onClick={() => h.onMove(q.id, 1)} />
          <IconButton aria-label={copy.duplicateQuestion(n)} icon={<Copy />} variant="ghost" disabled={!canAddQuestion} onClick={() => h.onDuplicate(q.id)} />
          <IconButton
            aria-label={q.locked ? `${copy.removeQuestion(n)} — ${copy.lockedRemove}` : copy.removeQuestion(n)}
            icon={<Trash2 />}
            variant="ghost"
            className="text-danger hover:text-danger"
            disabled={q.locked}
            onClick={() => h.onRemove(q.id)}
          />
        </div>
      </div>
      {q.locked && (
        <p id={lockNoteId} className="qx-caption mt-2 flex items-center gap-1.5 text-fg-muted">
          <Lock aria-hidden className="size-3.5 shrink-0" /> {copy.lockedType}
        </p>
      )}

      {/* Soru metni */}
      <div className="mt-3 space-y-1">
        <Label htmlFor={textId} className="sr-only">
          {copy.questionLabel(n)}
        </Label>
        <Textarea
          id={textId}
          value={q.text}
          rows={1}
          maxLength={SURVEY_LIMITS.questionTextMax}
          onChange={(e) => h.onText(q.id, e.target.value)}
          placeholder={copy.questionPlaceholder}
          className="min-h-11 resize-none text-base [field-sizing:content] sm:text-sm"
          aria-invalid={errors.text ? true : undefined}
          aria-describedby={errors.text ? `${textId}-error` : undefined}
        />
        <div className="flex items-start justify-between gap-2">
          {errors.text ? <InlineError id={`${textId}-error`}>{errors.text}</InlineError> : <span />}
          {q.text.length > SURVEY_LIMITS.questionTextMax * 0.8 && (
            <span className="qx-caption shrink-0 text-fg-muted tabular-nums">{copy.charCount(q.text.length, SURVEY_LIMITS.questionTextMax)}</span>
          )}
        </div>
      </div>

      {/* Seçenekler */}
      {choice && (
        <div className="mt-3 space-y-2">
          <p id={`${q.id}-options-hint`} className={cn('qx-caption', errors.options ? 'text-danger' : 'text-fg-muted')}>
            {copy.optionsHint}
          </p>
          <ul className="space-y-2">
            {q.options.map((opt, oi) => {
              const optError = errors.option?.[opt.id];
              const optId = `${q.id}-${opt.id}`;
              return (
                <li key={opt.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="qx-caption w-6 shrink-0 text-right text-fg-muted tabular-nums">
                      {oi + 1}.
                    </span>
                    <Label htmlFor={optId} className="sr-only">
                      {copy.optionPlaceholder(oi + 1)}
                    </Label>
                    <div className="relative min-w-0 flex-1">
                      <Input
                        id={optId}
                        value={opt.value}
                        readOnly={opt.locked}
                        maxLength={SURVEY_LIMITS.optionMax}
                        onChange={(e) => h.onOption(q.id, opt.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            h.onAddOption(q.id, opt.id);
                          }
                        }}
                        placeholder={copy.optionPlaceholder(oi + 1)}
                        className={cn('h-11 text-base sm:text-sm', opt.locked && 'bg-surface-2 pr-9 text-fg-muted')}
                        aria-invalid={optError || (errors.options && !opt.value.trim()) ? true : undefined}
                        aria-describedby={[optError ? `${optId}-error` : '', opt.locked ? `${optId}-lock` : ''].filter(Boolean).join(' ') || undefined}
                      />
                      {opt.locked && (
                        <>
                          <Lock aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
                          <span id={`${optId}-lock`} className="sr-only">
                            {copy.lockedOption}
                          </span>
                        </>
                      )}
                    </div>
                    {!opt.locked && q.options.length > SURVEY_LIMITS.optionsMin && removableOptions > 0 && (
                      <IconButton aria-label={copy.removeOption(oi + 1)} icon={<X />} variant="ghost" onClick={() => h.onRemoveOption(q.id, opt.id)} />
                    )}
                  </div>
                  {optError && (
                    <InlineError id={`${optId}-error`} className="pl-8">
                      {optError}
                    </InlineError>
                  )}
                </li>
              );
            })}
          </ul>
          {errors.options && <InlineError>{errors.options}</InlineError>}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 gap-1.5"
            onClick={() => h.onAddOption(q.id)}
            disabled={q.options.length >= SURVEY_LIMITS.optionsMax}
          >
            <Plus aria-hidden className="size-4" /> {copy.addOption}
            <span className="qx-caption text-fg-muted tabular-nums">
              ({q.options.length}/{SURVEY_LIMITS.optionsMax})
            </span>
          </Button>
        </div>
      )}

      {(errors.type || errors.other) && <InlineError className="mt-2">{errors.type ?? errors.other}</InlineError>}

      <div className="mt-3 flex min-h-11 items-center gap-2 border-t border-subtle pt-3">
        <Switch id={`${q.id}-required`} checked={q.required} onCheckedChange={(v) => h.onRequired(q.id, v)} aria-label={copy.requiredAria(n)} />
        <Label htmlFor={`${q.id}-required`} className="qx-small cursor-pointer text-fg-muted" aria-hidden>
          {copy.required}
        </Label>
      </div>
    </fieldset>
  );
});
