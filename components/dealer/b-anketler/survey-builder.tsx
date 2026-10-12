'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { AlertTriangle, ClipboardList, Eye, LayoutTemplate, Lock, Pencil, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { ConfirmAction, EmptyState, InlineError, TONE_CALLOUT } from '@/components/states';
import { fadeUp, SPRING } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion-pref';
import { cn } from '@/lib/utils';
import { isChoiceType, SURVEY_LIMITS, type SurveyQuestionType } from '@/lib/survey-schema';
import { buildSurveyPayload, mapIssuesToDraftErrors, validateSurveyDraft, type DraftErrors } from '@/lib/survey-draft';
import { surveyTemplates, type SurveyTemplate } from '@/lib/dealer-surveys/templates';
import type { SurveyEditorData } from '@/lib/dealer-surveys/types';
import { createSurvey, surveyKeys, SurveyApiError, updateSurvey } from './api';
import {
  blankOption,
  blankQuestion,
  draftFromEditor,
  draftFromTemplate,
  draftSignature,
  DRAFT_STORAGE_KEY,
  duplicateQuestion,
  EMPTY_DRAFT,
  moveItem,
  parseStoredDraft,
  serializeDraft,
  toSurveyDraft,
  type BuilderDraft,
  type BuilderQuestion,
} from './builder-model';
import { errorText, useSurveyCopy } from './copy';
import { QuestionEditor, type QuestionEditorHandlers } from './question-editor';
import { SurveyPreview } from './survey-preview';

const NO_ERRORS: DraftErrors = { byQuestion: {}, count: 0 };

export type SurveyBuilderProps =
  | { mode: 'create'; quota: { used: number; limit: number } | null; templateKey: string | null; startBlank: boolean }
  | { mode: 'edit'; editor: SurveyEditorData };

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* gizli pencere / engelli depolama: taslak yalnız bellekte kalır */
  }
}

/**
 * Anket Stüdyosu oluşturucusu (oluştur + düzenle tek bileşen).
 *  - Ortak zod sözleşmesiyle canlı doğrulama; sunucu hataları soru/seçenek kartına bağlanır.
 *  - Şablon galerisi, soru sıralama (yukarı/aşağı), çoğaltma, geri alınabilir silme.
 *  - Canlı müşteri önizlemesi (masaüstünde yan panel, mobilde "Önizleme" sekmesi).
 *  - Oluşturmada yerel taslak (cihazda), kirli durumda çıkış onayı (bağlantılar + sekme kapatma).
 *  - Düzenlemede yapısal kilit (yanıt almış anket) arayüzde de görünür.
 */
export function SurveyBuilder(props: SurveyBuilderProps) {
  const { copy, locale } = useSurveyCopy();
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = props.mode === 'edit';
  const editor = isEdit ? props.editor : null;
  const templates = useMemo(() => surveyTemplates(locale), [locale]);

  const initialDraft = useMemo<BuilderDraft>(() => {
    if (editor) return draftFromEditor(editor);
    if (props.mode === 'create' && props.templateKey) {
      const tpl = templates.find((t) => t.key === props.templateKey);
      if (tpl) return draftFromTemplate(tpl);
    }
    return EMPTY_DRAFT;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız ilk açılış
  }, []);

  const [draft, setDraft] = useState<BuilderDraft>(initialDraft);
  const [baseline, setBaseline] = useState(() => draftSignature(isEdit ? initialDraft : EMPTY_DRAFT));
  const [started, setStarted] = useState(() => isEdit || initialDraft !== EMPTY_DRAFT || (props.mode === 'create' && props.startBlank));
  const [restored, setRestored] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<DraftErrors | null>(null);
  const [saving, setSaving] = useState<null | 'publish' | 'paused' | 'update'>(null);
  const reduceMotion = useReducedMotionPref();
  const [activeQ, setActiveQ] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const leavingRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const dirty = draftSignature(draft) !== baseline;
  const quota = props.mode === 'create' ? props.quota : null;
  const quotaFull = !!quota && quota.used >= quota.limit;
  const atLimit = draft.questions.length >= SURVEY_LIMITS.questionsMax;

  const liveErrors = useMemo(() => (showErrors ? validateSurveyDraft(toSurveyDraft(draft)).errors : NO_ERRORS), [draft, showErrors]);
  const errors = serverErrors ?? liveErrors;

  // ── Yerel taslak: yalnız oluşturmada, şablon/boş başlangıç istenmediyse geri yükle.
  useEffect(() => {
    if (props.mode !== 'create' || props.templateKey) return;
    const stored = parseStoredDraft(readStorage(DRAFT_STORAGE_KEY));
    if (stored) {
      setDraft(stored);
      setStarted(true);
      setRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (props.mode !== 'create' || !dirty) return;
    const t = window.setTimeout(() => writeStorage(DRAFT_STORAGE_KEY, serializeDraft(draft)), 600);
    return () => window.clearTimeout(t);
  }, [draft, dirty, props.mode]);

  // ── Kirli çıkış koruması: sekme kapatma + uygulama içi bağlantılar.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (leavingRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  // ── Odak yönetimi (yeni soru/seçenek → ilgili alan).
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      setFocusId(null);
    }
  }, [focusId, draft]);

  const update = useCallback((fn: (d: BuilderDraft) => BuilderDraft) => {
    setServerErrors(null);
    setDraft(fn);
  }, []);
  const updateQ = useCallback(
    (qid: string, fn: (q: BuilderQuestion) => BuilderQuestion) =>
      update((d) => ({ ...d, questions: d.questions.map((q) => (q.id === qid ? fn(q) : q)) })),
    [update],
  );

  const addQuestion = useCallback(
    (type: SurveyQuestionType = 'single_choice') => {
      const q = blankQuestion(type);
      update((d) => (d.questions.length >= SURVEY_LIMITS.questionsMax ? d : { ...d, questions: [...d.questions, q] }));
      setFocusId(`${q.id}-text`);
      setActiveQ(q.id);
    },
    [update],
  );

  const handlers = useMemo<QuestionEditorHandlers>(
    () => ({
      onText: (qid, text) => updateQ(qid, (q) => ({ ...q, text })),
      onRequired: (qid, required) => updateQ(qid, (q) => ({ ...q, required })),
      onType: (qid, type) =>
        updateQ(qid, (q) => {
          if (q.locked) return q;
          const options =
            isChoiceType(type) && q.options.length < SURVEY_LIMITS.optionsMin
              ? [...q.options, ...Array.from({ length: SURVEY_LIMITS.optionsMin - q.options.length }, () => blankOption())]
              : q.options;
          return { ...q, type, options };
        }),
      onOption: (qid, oid, value) =>
        updateQ(qid, (q) => ({ ...q, options: q.options.map((o) => (o.id === oid && !o.locked ? { ...o, value } : o)) })),
      onAddOption: (qid, afterOid) => {
        const opt = blankOption();
        updateQ(qid, (q) => {
          if (q.options.length >= SURVEY_LIMITS.optionsMax) return q;
          const at = afterOid ? q.options.findIndex((o) => o.id === afterOid) + 1 : q.options.length;
          const options = q.options.slice();
          options.splice(at <= 0 ? options.length : at, 0, opt);
          return { ...q, options };
        });
        setFocusId(`${qid}-${opt.id}`);
      },
      onRemoveOption: (qid, oid) => updateQ(qid, (q) => ({ ...q, options: q.options.filter((o) => o.id !== oid || o.locked) })),
      onMove: (qid, dir) => {
        update((d) => {
          const i = d.questions.findIndex((q) => q.id === qid);
          return { ...d, questions: moveItem(d.questions, i, i + dir) };
        });
        setActiveQ(qid);
      },
      onDuplicate: (qid) => {
        const d = draftRef.current;
        const i = d.questions.findIndex((q) => q.id === qid);
        if (i < 0 || d.questions.length >= SURVEY_LIMITS.questionsMax) return;
        const dup = duplicateQuestion(d.questions[i]);
        update((cur) => {
          const at = cur.questions.findIndex((q) => q.id === qid);
          if (at < 0 || cur.questions.length >= SURVEY_LIMITS.questionsMax) return cur;
          const questions = cur.questions.slice();
          questions.splice(at + 1, 0, dup);
          return { ...cur, questions };
        });
        setFocusId(`${dup.id}-text`);
      },
      onRemove: (qid) => {
        const d = draftRef.current;
        const index = d.questions.findIndex((q) => q.id === qid);
        if (index < 0 || d.questions[index].locked) return;
        const removed = d.questions[index];
        const neighbour = d.questions[index - 1] ?? d.questions[index + 1];
        update((cur) => ({ ...cur, questions: cur.questions.filter((q) => q.id !== qid) }));
        setFocusId(neighbour ? `${neighbour.id}-text` : 'survey-add-question');
        toast(copy.questionRemoved(index + 1), {
          action: {
            label: copy.undo,
            onClick: () =>
              setDraft((cur) => {
                if (cur.questions.some((x) => x.id === removed.id) || cur.questions.length >= SURVEY_LIMITS.questionsMax) return cur;
                const questions = cur.questions.slice();
                questions.splice(Math.min(index, questions.length), 0, removed);
                return { ...cur, questions };
              }),
          },
        });
      },
      onActive: (qid) => setActiveQ(qid),
    }),
    [update, updateQ, copy],
  );

  function chooseTemplate(tpl: SurveyTemplate | null) {
    setServerErrors(null);
    setDraft(tpl ? draftFromTemplate(tpl) : { ...EMPTY_DRAFT, questions: [blankQuestion()] });
    setStarted(true);
    setRestored(false);
    requestAnimationFrame(() => document.getElementById('survey-title')?.focus());
  }

  function discardDraft() {
    writeStorage(DRAFT_STORAGE_KEY, null);
    setDraft(EMPTY_DRAFT);
    setRestored(false);
    setStarted(false);
    setShowErrors(false);
  }

  function focusFirstInvalid() {
    setMobileView('edit');
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-survey-builder] [aria-invalid="true"]');
      el?.focus();
      el?.scrollIntoView({ block: 'center' });
    });
  }

  async function save(kind: 'publish' | 'paused' | 'update') {
    setShowErrors(true);
    setServerErrors(null);
    const sd = toSurveyDraft(draft);
    const result = validateSurveyDraft(sd);
    if (!result.ok) {
      toast.error(result.firstMessage && locale === 'tr' ? result.firstMessage : copy.toastFixErrors);
      focusFirstInvalid();
      return;
    }
    setSaving(kind);
    try {
      if (kind === 'update' && editor) {
        await updateSurvey(editor.survey.id, { ...result.payload, questionIds: draft.questions.map((q) => q.serverId) });
        leavingRef.current = true;
        setBaseline(draftSignature(draft));
        await qc.invalidateQueries({ queryKey: surveyKeys.all });
        toast.success(copy.toastUpdated);
        router.push(`/dealer/surveys/${editor.survey.id}/results`);
        return;
      }
      const r = await createSurvey({ ...result.payload, publish: kind === 'publish' });
      leavingRef.current = true;
      writeStorage(DRAFT_STORAGE_KEY, null);
      setBaseline(draftSignature(draft));
      await qc.invalidateQueries({ queryKey: surveyKeys.list });
      if (kind === 'publish') {
        toast.success(copy.toastCreated);
        router.push(`/dealer/surveys/${r.survey.id}/results?share=1`);
      } else {
        toast.success(copy.toastCreatedPaused);
        router.push(`/dealer/surveys?new=${r.survey.id}`);
      }
    } catch (e) {
      leavingRef.current = false;
      if (e instanceof SurveyApiError) {
        if (e.issues.length > 0) {
          const { optionIds } = buildSurveyPayload(sd);
          setServerErrors(mapIssuesToDraftErrors(e.issues, sd, optionIds));
          focusFirstInvalid();
        } else if (e.code === 'STRUCTURE_LOCKED' || e.code === 'UNKNOWN_QUESTION') {
          const idx = (e.details as { questionIndex?: unknown } | undefined)?.questionIndex;
          const target = typeof idx === 'number' ? draft.questions[idx] : undefined;
          if (target) {
            setServerErrors({ byQuestion: { [target.id]: { other: errorText(copy, locale, e) } }, count: 1 });
            focusFirstInvalid();
          }
        }
      }
      toast.error(errorText(copy, locale, e));
    } finally {
      setSaving(null);
    }
  }

  const title = isEdit ? copy.editTitle : copy.createTitle;
  const showGallery = !isEdit && !started && !dirty;

  return (
    <PanelPage
      register="ops"
      width="wide"
      header={
        <PageHeader
          eyebrow={copy.eyebrow}
          title={title}
          description={isEdit ? copy.editDescription : copy.createDescription}
          icon={isEdit ? <Pencil /> : <ClipboardList />}
          back={{ href: isEdit && editor ? `/dealer/surveys/${editor.survey.id}/results` : '/dealer/surveys', label: copy.backToList }}
        />
      }
    >
      <div data-survey-builder className="space-y-5">
        {quotaFull && quota && (
          <p role="alert" className={cn('qx-small flex items-start gap-2 rounded-card border p-3', TONE_CALLOUT.warning)}>
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            {copy.quotaFull(quota.limit)}
          </p>
        )}

        {editor?.structuralLock && (
          <div role="note" className={cn('flex items-start gap-3 rounded-card border p-4', TONE_CALLOUT.info)}>
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            <div className="space-y-1">
              <p className="qx-small font-semibold text-fg">{copy.lockedTitle(editor.responseCount)}</p>
              <p className="qx-small text-fg-muted">{copy.lockedBody}</p>
            </div>
          </div>
        )}

        {restored && (
          <div role="status" className={cn('flex flex-col gap-2 rounded-card border p-3 sm:flex-row sm:items-center', TONE_CALLOUT.brand)}>
            <p className="qx-small flex-1 text-fg">{copy.draftRestored}</p>
            <Button variant="outline" size="sm" className="min-h-11" onClick={discardDraft}>
              {copy.discardDraft}
            </Button>
          </div>
        )}

        <AnimatePresence initial={false}>
          {showGallery && (
            <Motion.section key="gallery" variants={fadeUp} initial="hidden" animate="visible" exit="exit" aria-labelledby="survey-start-heading" className="space-y-3">
              <div>
                <h2 id="survey-start-heading" className="qx-h3 text-fg">
                  {copy.startHeading}
                </h2>
                <p className="qx-small text-fg-muted">{copy.startDescription}</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <li>
                  <button
                    type="button"
                    onClick={() => chooseTemplate(null)}
                    className="flex h-full min-h-11 w-full flex-col gap-1 rounded-card border border-dashed border-strong bg-surface-1 p-4 text-left transition-colors duration-fast hover:border-brand-border hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span className="qx-body flex items-center gap-2 font-semibold text-fg">
                      <Plus aria-hidden className="size-4 text-brand" /> {copy.blankTitle}
                    </span>
                    <span className="qx-small text-fg-muted">{copy.blankPitch}</span>
                  </button>
                </li>
                {templates.map((tpl) => (
                  <li key={tpl.key}>
                    <button
                      type="button"
                      onClick={() => chooseTemplate(tpl)}
                      className="flex h-full min-h-11 w-full flex-col gap-1 rounded-card border border-subtle bg-surface-1 p-4 text-left transition-colors duration-fast hover:border-brand-border hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <span className="qx-body flex items-center gap-2 font-semibold text-fg">
                        <LayoutTemplate aria-hidden className="size-4 text-brand" /> {tpl.title}
                      </span>
                      <span className="qx-small text-fg-muted">{tpl.pitch}</span>
                      <span className="qx-caption mt-auto pt-2 text-fg-muted">{copy.templateQuestions(tpl.questions.length)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Motion.section>
          )}
        </AnimatePresence>

        {/* Mobil: düzenle / önizle geçişi (masaüstünde iki panel yan yana) */}
        <div className="lg:hidden">
          <ChoiceChips
            aria-label={`${copy.editTab} / ${copy.previewTab}`}
            value={mobileView}
            onChange={(v) => v && setMobileView(v as 'edit' | 'preview')}
            options={[
              { value: 'edit', label: copy.editTab, icon: <Pencil aria-hidden className="size-4" /> },
              { value: 'preview', label: copy.previewTab, icon: <Eye aria-hidden className="size-4" /> },
            ]}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className={cn('min-w-0 space-y-5 lg:col-span-7', mobileView === 'preview' && 'hidden lg:block')}>
            {/* Başlık ve açıklama */}
            <section aria-label={copy.labelTitle} className="space-y-4 rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 sm:p-5">
              <div className="space-y-1.5">
                <Label htmlFor="survey-title">
                  {copy.labelTitle} <span aria-hidden className="text-danger">*</span>
                </Label>
                <Input
                  id="survey-title"
                  value={draft.title}
                  maxLength={SURVEY_LIMITS.titleMax}
                  required
                  onChange={(e) => update((d) => ({ ...d, title: e.target.value }))}
                  placeholder={copy.placeholderTitle}
                  className="h-11 text-base sm:text-sm"
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? 'survey-title-error' : undefined}
                />
                {errors.title && <InlineError id="survey-title-error">{errors.title}</InlineError>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="survey-description">
                    {copy.labelDescription} <span className="qx-caption font-normal text-fg-muted">{copy.optional}</span>
                  </Label>
                  <span className="qx-caption text-fg-muted tabular-nums" aria-hidden>
                    {copy.charCount(draft.description.length, SURVEY_LIMITS.descriptionMax)}
                  </span>
                </div>
                <Textarea
                  id="survey-description"
                  value={draft.description}
                  maxLength={SURVEY_LIMITS.descriptionMax}
                  onChange={(e) => update((d) => ({ ...d, description: e.target.value }))}
                  placeholder={copy.placeholderDescription}
                  rows={2}
                  className="text-base sm:text-sm"
                  aria-invalid={errors.description ? true : undefined}
                />
                {errors.description && <InlineError>{errors.description}</InlineError>}
              </div>
            </section>

            {/* Sorular */}
            <section aria-labelledby="survey-questions-heading" className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="survey-questions-heading" className="qx-h3 text-fg">
                    {copy.questionsHeading}
                  </h2>
                  <p className="qx-caption text-fg-muted tabular-nums">{copy.questionLimit(draft.questions.length, SURVEY_LIMITS.questionsMax)}</p>
                </div>
              </div>

              {errors.questions && <InlineError variant="banner">{errors.questions}</InlineError>}

              {draft.questions.length === 0 ? (
                <EmptyState icon={Sparkles} title={copy.noQuestions} description={copy.noQuestionsHint} compact headingLevel="h3" />
              ) : (
                <ol className="space-y-3">
                  <AnimatePresence initial={false}>
                    {draft.questions.map((q, i) => (
                      <Motion.li key={q.id} layout={reduceMotion ? false : 'position'} transition={{ layout: SPRING.snappy }} variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                        <QuestionEditor
                          q={q}
                          index={i}
                          total={draft.questions.length}
                          errors={errors.byQuestion[q.id] ?? {}}
                          canAddQuestion={!atLimit}
                          h={handlers}
                        />
                      </Motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              )}

              <Button id="survey-add-question" type="button" variant="outline" className="min-h-11 w-full gap-2 border-dashed" onClick={() => addQuestion()} disabled={atLimit}>
                <Plus aria-hidden className="size-4" /> {copy.addQuestion}
              </Button>
            </section>
          </div>

          <aside className={cn('min-w-0 lg:col-span-5', mobileView === 'edit' && 'hidden lg:block')}>
            <div className="lg:sticky lg:top-4">
              <SurveyPreview draft={draft} activeQuestionId={activeQ} />
            </div>
          </aside>
        </div>

        {/* Eylem çubuğu — kaydırmada görünür kalır */}
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 rounded-card border border-subtle bg-surface-1/95 p-3 qx-elevation-1 backdrop-blur supports-[backdrop-filter]:bg-surface-1/85 sm:flex-row sm:items-center">
          <p className="qx-caption flex-1 text-fg-muted" aria-live="polite">
            {dirty ? copy.dirty : isEdit ? copy.allSaved : ''}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => (dirty ? setPendingHref(isEdit && editor ? `/dealer/surveys/${editor.survey.id}/results` : '/dealer/surveys') : router.push(isEdit && editor ? `/dealer/surveys/${editor.survey.id}/results` : '/dealer/surveys'))}
            >
              {copy.cancel}
            </Button>
            {isEdit ? (
              <Button className="min-h-11" onClick={() => void save('update')} loading={saving === 'update'} disabled={!!saving || !dirty}>
                {copy.saveChanges}
              </Button>
            ) : (
              <>
                <Button variant="outline" className="min-h-11" onClick={() => void save('paused')} loading={saving === 'paused'} disabled={!!saving || quotaFull}>
                  {copy.savePaused}
                </Button>
                <Button className="min-h-11" onClick={() => void save('publish')} loading={saving === 'publish'} disabled={!!saving || quotaFull}>
                  {copy.publish}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmAction
        open={!!pendingHref}
        onOpenChange={(o) => !o && setPendingHref(null)}
        tone="warning"
        title={copy.leaveTitle}
        description={copy.leaveDescription}
        irreversibleNote={false}
        confirmLabel={copy.leaveConfirm}
        onConfirm={() => {
          const href = pendingHref;
          leavingRef.current = true;
          setPendingHref(null);
          if (href) router.push(href);
        }}
      />
    </PanelPage>
  );
}
