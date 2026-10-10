'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CalendarX2, Check, CheckCircle2, Clock, ListChecks, Pencil, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InlineError } from '@/components/states';
import { RatingInput, announce } from '@/components/ds/a11y';
import { DURATION, EASE, SPRING, popIn, useMotionPolicy } from '@/lib/motion';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { PublicSurveyQuestion, SurveyAnswerValue } from '@/lib/survey-schema';
import type { SurveyFillView } from '@/lib/survey-fill';
import { getShareCopy, type ShareCopy, type ShareLocale } from './copy';
import { authHref } from './labels';
import { StatusPanel } from './status-panel';
import { VenueAvatar } from './venue-visual';
import {
  answerSummary,
  buildSubmission,
  countAnswered,
  draftKey,
  DRAFT_VERSION,
  isAnswered,
  missingRequired,
  sanitizeDraft,
  toggleOption,
  type SurveyAnswers,
} from './survey-flow-logic';

type Phase = 'intro' | 'question' | 'review' | 'done' | 'already' | 'closed';
type Viewer = { signedIn: boolean; role: string | null };

const AUTO_ADVANCE_MS = 320;

/**
 * Soru/özet sütunu: en az bir ekran boyu (başlık 56px + üst boşluk düşülür) esnek sütun →
 * eylem çubuğu kısa içerikte de başparmak bölgesinde (ekranın altında) durur.
 */
const FLOW_COLUMN = 'mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col lg:min-h-0';

function readDraft(surveyId: string): unknown {
  try {
    const raw = window.sessionStorage.getItem(draftKey(surveyId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(surveyId: string, answers: SurveyAnswers, step: number) {
  try {
    window.sessionStorage.setItem(
      draftKey(surveyId),
      JSON.stringify({ v: DRAFT_VERSION, answers, step, savedAt: Date.now() })
    );
  } catch {
    /* gizli mod / kota — taslak yardımcıdır */
  }
}

function clearDraft(surveyId: string) {
  try {
    window.sessionStorage.removeItem(draftKey(surveyId));
  } catch {
    /* yok say */
  }
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return {};
  return ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
}

/**
 * Anket doldurma akışı (mobil öncelikli, Typeform deseni): kapak → soru-başına-ekran →
 * özet → sonuç. İlerleme çubuğu + "3 / 8", yapışkan Geri/İleri çubuğu (güvenli alan),
 * oturum deposunda taslak, ilk eksik soruya odak, sunucu hatasının soruya bağlanması.
 * Erişilebilirlik: her soru `fieldset` + başlık, zorunluluk metinle, adım değişiminde odak
 * soru başlığına taşınır ve duyurulur; seçimle otomatik ilerleme yalnız işaretçi girdisinde.
 */
export function SurveyFlow({
  survey,
  alreadyResponded,
  viewer,
  locale,
}: {
  survey: SurveyFillView;
  alreadyResponded: boolean;
  viewer: Viewer;
  locale: ShareLocale;
}) {
  const copy = getShareCopy(locale);
  const policy = useMotionPolicy();
  const questions = survey.questions;
  const total = questions.length;

  const [phase, setPhase] = useState<Phase>(alreadyResponded ? 'already' : 'intro');
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [returnToReview, setReturnToReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ answers: SurveyAnswers; step: number } | null>(null);

  const phaseFocusRef = useRef<HTMLDivElement>(null);
  const pointerInput = useRef(false);
  const advanceTimer = useRef<number | null>(null);
  const focusOnStep = useRef(false);
  const started = useRef(false);

  // Taslak yalnız istemcide okunur (hidrasyon uyuşmazlığı yok).
  useEffect(() => {
    if (alreadyResponded) {
      clearDraft(survey.id);
      return;
    }
    setDraft(sanitizeDraft(readDraft(survey.id), questions));
  }, [survey.id, questions, alreadyResponded]);

  // Cevaplar değiştikçe taslağı sakla (yalnız akış başladıktan sonra).
  useEffect(() => {
    if (!started.current || phase === 'done' || phase === 'already' || phase === 'closed') return;
    writeDraft(survey.id, answers, step);
  }, [answers, step, phase, survey.id]);

  useEffect(() => () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
  }, []);

  // Adım değişiminde odak YENİ soru başlığına (AnimatePresence eskiyi çıkarıp yeniyi bağladığında).
  // Başlık "Soru 3 / 8" önekini ekran okuyucu için kendi içinde taşır.
  const headingRef = useCallback((el: HTMLHeadingElement | null) => {
    if (el && focusOnStep.current) {
      focusOnStep.current = false;
      el.focus({ preventScroll: false });
    }
  }, []);

  // Faz değişiminde (özet / sonuç) odak yeni içeriğin başına.
  useEffect(() => {
    if (phase === 'review' || phase === 'done' || phase === 'already' || phase === 'closed') {
      const id = window.requestAnimationFrame(() => phaseFocusRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
  }, [phase]);

  const answeredCount = useMemo(() => countAnswered(questions, answers), [questions, answers]);
  const missing = useMemo(() => missingRequired(questions, answers), [questions, answers]);

  const clearTimer = () => {
    if (advanceTimer.current) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };

  const goTo = useCallback(
    (index: number, opts: { fromReview?: boolean } = {}) => {
      clearTimer();
      const next = Math.min(Math.max(0, index), Math.max(0, total - 1));
      setDirection(next >= step ? 1 : -1);
      setStep(next);
      setReturnToReview(Boolean(opts.fromReview));
      setPhase('question');
      focusOnStep.current = true;
    },
    [step, total]
  );

  function start(resume: boolean) {
    started.current = true;
    if (resume && draft) {
      setAnswers(draft.answers);
      announce(copy.svDraftRestored);
      track('survey_resume', { surveyId: survey.id });
      goTo(draft.step);
    } else {
      setAnswers({});
      clearDraft(survey.id);
      track('survey_start', { surveyId: survey.id, questions: total });
      goTo(0);
    }
  }

  function setAnswer(q: PublicSurveyQuestion, value: SurveyAnswerValue) {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    setSubmitError(null);
    setErrors((prev) => {
      if (!prev[q.id]) return prev;
      const n = { ...prev };
      delete n[q.id];
      return n;
    });
  }

  function validateCurrent(): boolean {
    const q = questions[step];
    if (!q) return true;
    if (q.required && !isAnswered(q, answers)) {
      setErrors((prev) => ({ ...prev, [q.id]: copy.svRequiredError }));
      announce(copy.svRequiredError, { politeness: 'assertive' });
      return false;
    }
    return true;
  }

  function next() {
    if (!validateCurrent()) return;
    clearTimer();
    if (returnToReview || step >= total - 1) {
      setPhase('review');
      setReturnToReview(false);
      return;
    }
    goTo(step + 1);
  }

  function back() {
    clearTimer();
    if (step === 0) {
      setPhase('intro');
      return;
    }
    goTo(step - 1);
  }

  /** Tek seçim / puanda işaretçiyle seçince kısa gecikmeyle ilerle (klavyede ilerlemez — WCAG 3.2.2). */
  function maybeAutoAdvance(q: PublicSurveyQuestion) {
    const wasPointer = pointerInput.current;
    pointerInput.current = false;
    if (!wasPointer || policy.reduce || returnToReview || step >= total - 1) return;
    if (q.type !== 'single_choice' && q.type !== 'rating') return;
    clearTimer();
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      goTo(step + 1);
    }, AUTO_ADVANCE_MS);
  }

  async function submit() {
    if (submitting) return;
    if (missing.length > 0) {
      setErrors((prev) => ({ ...prev, ...Object.fromEntries(missing.map((q) => [q.id, copy.svRequiredError])) }));
      goTo(questions.indexOf(missing[0]), { fromReview: true });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/surveys/${encodeURIComponent(survey.id)}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(buildSubmission(questions, answers)),
      });
      const data = await readJsonSafe(res);
      if (res.ok) {
        clearDraft(survey.id);
        track('survey_submit', { surveyId: survey.id, answered: answeredCount, total });
        setPhase('done');
        return;
      }
      const code = typeof data.code === 'string' ? data.code : '';
      const details = (data.details && typeof data.details === 'object' ? data.details : {}) as { questionId?: unknown };
      if (code === 'ALREADY_RESPONDED') {
        clearDraft(survey.id);
        setPhase('already');
        return;
      }
      if (code === 'SURVEY_CLOSED' || code === 'SURVEY_NOT_FOUND') {
        clearDraft(survey.id);
        setPhase('closed');
        return;
      }
      if (code === 'RATE_LIMITED') {
        setSubmitError(copy.svRateLimited);
        return;
      }
      const qid = typeof details.questionId === 'string' ? details.questionId : null;
      const index = qid ? questions.findIndex((q) => q.id === qid) : -1;
      if (index >= 0) {
        const message =
          code === 'REQUIRED_MISSING'
            ? copy.svRequiredError
            : locale === 'tr' && typeof data.error === 'string'
              ? data.error
              : copy.svInvalidAnswer;
        setErrors((prev) => ({ ...prev, [qid!]: message }));
        goTo(index, { fromReview: true });
        return;
      }
      setSubmitError(copy.svSubmitFailed);
    } catch {
      setSubmitError(copy.svSubmitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  // ───────────────────────────── Sonuç / durum fazları ─────────────────────────────

  if (phase === 'done' || phase === 'already' || phase === 'closed') {
    return (
      <div ref={phaseFocusRef} tabIndex={-1} className="mx-auto w-full max-w-lg px-4 py-12 outline-none sm:py-16">
        {phase === 'closed' ? (
          <StatusPanel
            icon={CalendarX2}
            title={copy.svClosedTitle}
            description={copy.svClosedBody(survey.dealer.name)}
            actions={
              <Button asChild variant="outline" className="w-full">
                <Link href="/">{copy.goHome}</Link>
              </Button>
            }
          />
        ) : (
          <StatusPanel
            tone="success"
            visual={
              <Motion.span
                aria-hidden
                variants={policy.variants(popIn)}
                initial="hidden"
                animate="visible"
                className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle text-success"
              >
                <CheckCircle2 className="h-9 w-9" strokeWidth={1.75} />
              </Motion.span>
            }
            title={phase === 'done' ? copy.svThanksTitle : copy.svAlreadyTitle}
            description={phase === 'done' ? copy.svThanksBody(survey.dealer.name) : copy.svAlreadyBody}
            actions={<OutcomeActions copy={copy} viewer={viewer} dealerId={survey.dealer.id} />}
          />
        )}
      </div>
    );
  }

  // ───────────────────────────── Kapak ─────────────────────────────

  if (phase === 'intro') {
    const resumeCount = draft ? countAnswered(questions, draft.answers) : 0;
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
        <Motion.div variants={policy.variants(popIn)} initial="hidden" animate="visible" className="flex flex-col items-center text-center">
          <VenueAvatar logo={survey.dealer.logo} category={null} size="lg" />
          {survey.dealer.name && <p className="qx-small mt-3 font-medium text-fg-muted">{survey.dealer.name}</p>}
          <h1 className="qx-h1 mt-1 text-balance text-fg">{survey.title}</h1>
          {survey.description && <p className="qx-body mt-3 whitespace-pre-line text-pretty text-fg-muted">{survey.description}</p>}
        </Motion.div>

        {total === 0 ? (
          <p role="status" className="qx-body mt-8 rounded-card border border-subtle bg-surface-1 p-6 text-center text-fg-muted">
            {copy.svNoQuestions}
          </p>
        ) : (
          <>
            <ul className="qx-small mt-6 flex flex-wrap items-center justify-center gap-2" aria-label={survey.title}>
              <MetaChip icon={ListChecks}>{copy.svQuestions(total)}</MetaChip>
              <MetaChip icon={Clock}>{copy.svDuration(survey.estimatedSeconds)}</MetaChip>
              <MetaChip icon={Sparkles}>{copy.svRequiredCount(survey.requiredCount)}</MetaChip>
            </ul>

            <p className="qx-small mt-6 flex items-start gap-2 rounded-card border border-subtle bg-surface-1 p-3 text-left text-fg-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <span>{viewer.signedIn ? copy.svPrivacySignedIn : copy.svPrivacyAnon}</span>
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {draft && resumeCount > 0 ? (
                <>
                  <Button size="lg" className="w-full gap-2" onClick={() => start(true)}>
                    {copy.svResume(resumeCount, total)}
                    <ArrowRight className="h-5 w-5" aria-hidden />
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => start(false)}>
                    {copy.svRestart}
                  </Button>
                </>
              ) : (
                <Button size="lg" className="w-full gap-2" onClick={() => start(false)}>
                  {copy.svStart}
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ───────────────────────────── Özet ─────────────────────────────

  const progressPct = phase === 'review' ? 100 : Math.round(((step + 1) / Math.max(1, total)) * 100);

  const progress = (
    <div className="space-y-2">
      <div className="qx-caption flex items-center justify-between gap-3 text-fg-muted">
        <span className="truncate font-medium">{survey.dealer.name ?? survey.title}</span>
        <span className="qx-num shrink-0">{copy.svAnswered(answeredCount, total)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={copy.svProgressLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answeredCount}
        aria-valuetext={copy.svAnswered(answeredCount, total)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <Motion.div
          className="h-full rounded-full bg-brand"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={policy.reduce ? { duration: 0 } : SPRING.gentle}
        />
      </div>
    </div>
  );

  if (phase === 'review') {
    return (
      <div className={cn(FLOW_COLUMN, 'px-4 pt-6 sm:pt-10')}>
        {progress}
        <div ref={phaseFocusRef} tabIndex={-1} className="mt-6 outline-none">
          <h1 className="qx-h2 text-fg">{copy.svReviewTitle}</h1>
          <p className="qx-body mt-1 text-fg-muted">{copy.svReviewBody}</p>
        </div>

        {missing.length > 0 && (
          <InlineError variant="banner" className="mt-4">
            {copy.svMissingCount(missing.length)}
          </InlineError>
        )}

        <ol className="mt-5 space-y-2">
          {questions.map((q, i) => {
            const summary = answerSummary(q, answers[q.id]);
            const isMissing = q.required && summary == null;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => goTo(i, { fromReview: true })}
                  aria-label={`${copy.svEditAria(i + 1)}: ${q.text}`}
                  className={cn(
                    'flex min-h-14 w-full items-start gap-3 rounded-card border bg-surface-1 p-4 text-left transition-colors duration-fast ease-standard hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    isMissing ? 'border-danger-border' : 'border-subtle'
                  )}
                >
                  <span className="qx-small qx-num mt-0.5 w-6 shrink-0 text-fg-muted">{i + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="qx-small block font-medium text-fg">{q.text}</span>
                    <span
                      className={cn(
                        'qx-small mt-1 block break-words',
                        summary ? 'text-fg' : isMissing ? 'font-medium text-danger' : 'text-fg-subtle'
                      )}
                    >
                      {summary ?? (isMissing ? copy.svReviewMissing : copy.svReviewEmpty)}
                    </span>
                  </span>
                  <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>

        <p className="qx-caption mt-5 flex items-start gap-2 text-fg-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{viewer.signedIn ? copy.svPrivacySignedIn : copy.svPrivacyAnon}</span>
        </p>

        {submitError && (
          <InlineError variant="banner" className="mt-4" onRetry={submit}>
            {submitError}
          </InlineError>
        )}

        <div aria-hidden className="h-8 shrink-0" />
        <BottomBar>
          <Button variant="outline" className="gap-2" onClick={() => goTo(total - 1)}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {copy.svBack}
          </Button>
          <Button className="flex-1 gap-2 sm:flex-none sm:px-8" onClick={submit} loading={submitting}>
            {!submitting && <Send className="h-4 w-4" aria-hidden />}
            {submitting ? copy.svSubmitting : copy.svSubmit}
          </Button>
        </BottomBar>
      </div>
    );
  }

  // ───────────────────────────── Soru ─────────────────────────────

  const q = questions[step];
  const err = q ? errors[q.id] : undefined;
  const headingId = `sv-q-${step}`;
  const errId = `sv-q-${step}-error`;
  const hintId = `sv-q-${step}-hint`;
  const isLast = step >= total - 1;
  const blank = q ? !isAnswered(q, answers) : true;
  const nextLabel = returnToReview ? copy.svBackToReview : isLast ? copy.svToReview : blank && !q?.required ? copy.svSkip : copy.svNext;

  const slide = policy.reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: direction * 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction * -24 },
      };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
      <div className={cn(FLOW_COLUMN, 'lg:mx-0')}>
        {progress}

        <AnimatePresence mode="wait" initial={false}>
          {q && (
            <Motion.fieldset
              key={q.id}
              {...slide}
              transition={{ duration: DURATION.base, ease: EASE.standard }}
              aria-labelledby={headingId}
              aria-describedby={[q.type === 'multiple_choice' ? hintId : null, err ? errId : null].filter(Boolean).join(' ') || undefined}
              className="mt-6 min-w-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="qx-overline text-brand">{copy.svStepOf(step + 1, total)}</span>
                <span
                  className={cn(
                    'qx-caption rounded-chip px-2 py-0.5 font-medium',
                    q.required ? 'bg-brand-subtle text-brand' : 'bg-surface-3 text-fg-muted'
                  )}
                >
                  {q.required ? copy.svRequired : copy.svOptional}
                </span>
              </div>
              <h1
                id={headingId}
                ref={headingRef}
                tabIndex={-1}
                className="qx-h2 mt-2 text-balance break-words text-fg outline-none"
              >
                <span className="sr-only">{copy.svStepOf(step + 1, total)}: </span>
                {q.text}
                {q.required && <span className="sr-only"> {copy.svRequiredSr}</span>}
              </h1>
              {q.type === 'multiple_choice' && (
                <p id={hintId} className="qx-small mt-1 text-fg-muted">
                  {copy.svMultiHint}
                </p>
              )}

              <div
                className="mt-5"
                onPointerDownCapture={() => {
                  pointerInput.current = true;
                }}
                onKeyDownCapture={() => {
                  pointerInput.current = false;
                }}
              >
                <QuestionInput
                  q={q}
                  value={answers[q.id]}
                  invalid={Boolean(err)}
                  headingId={headingId}
                  errId={err ? errId : undefined}
                  copy={copy}
                  maxText={survey.limits.openTextMax}
                  onChange={(value) => {
                    setAnswer(q, value);
                    maybeAutoAdvance(q);
                  }}
                  onToggle={(option) => {
                    pointerInput.current = false;
                    setAnswer(q, toggleOption(q, answers[q.id], option));
                  }}
                />
              </div>

              {err && (
                <InlineError id={errId} className="mt-3">
                  {err}
                </InlineError>
              )}
            </Motion.fieldset>
          )}
        </AnimatePresence>

        <div aria-hidden className="h-8 shrink-0" />
        <BottomBar>
          <Button variant="outline" className="gap-2" onClick={back}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {copy.svBack}
          </Button>
          <Button className="flex-1 gap-2 sm:flex-none sm:px-8" onClick={next}>
            {nextLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </BottomBar>
      </div>

      {/* Masaüstü: soru gezgini (yanıt durumu + doğrudan atlama) */}
      <nav aria-label={copy.svJump} className="hidden lg:block">
        <div className="sticky top-6 rounded-card border border-subtle bg-surface-1 p-3">
          <p className="qx-overline px-2 pb-2 text-fg-muted">{copy.svJump}</p>
          <ol className="max-h-[60vh] space-y-1 overflow-y-auto">
            {questions.map((item, i) => {
              const done = isAnswered(item, answers);
              const current = i === step;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i, { fromReview: returnToReview })}
                    aria-current={current ? 'step' : undefined}
                    aria-label={copy.svJumpTo(i + 1, done)}
                    className={cn(
                      'qx-small flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      current ? 'bg-brand-subtle font-medium text-fg' : 'text-fg-muted hover:bg-surface-2'
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]',
                        done ? 'border-success bg-success text-success-fg' : errors[item.id] ? 'border-danger-border text-danger' : 'border-strong'
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="line-clamp-2">{item.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>
    </div>
  );
}

// ───────────────────────────── Parçalar ─────────────────────────────

function MetaChip({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-chip border border-subtle bg-surface-1 px-3 py-1.5 text-fg">
      <Icon className="h-4 w-4 text-fg-muted" aria-hidden />
      {children}
    </li>
  );
}

/**
 * Başparmak bölgesinde yapışkan eylem çubuğu (güvenli alan payıyla). `sticky` → içerik
 * kaydıkça ekranın altında kalır, sayfa sonunda alt bilginin ÜSTÜNDE durur (örtmez).
 */
function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-sticky -mx-4 mt-auto border-t border-subtle bg-surface-0 px-4 safe-bottom">
      <div className="flex w-full items-center justify-between gap-3 py-3">{children}</div>
    </div>
  );
}

function QuestionInput({
  q,
  value,
  invalid,
  headingId,
  errId,
  copy,
  maxText,
  onChange,
  onToggle,
}: {
  q: PublicSurveyQuestion;
  value: SurveyAnswerValue | undefined;
  invalid: boolean;
  headingId: string;
  errId?: string;
  copy: ShareCopy;
  maxText: number;
  onChange: (value: SurveyAnswerValue) => void;
  onToggle: (option: string) => void;
}) {
  const optionClass =
    'flex min-h-14 cursor-pointer items-center gap-3 rounded-control border border-strong bg-surface-1 px-4 py-3 transition-colors duration-fast ease-standard hover:bg-surface-2 has-[:checked]:border-brand has-[:checked]:bg-brand-subtle has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background';

  if (q.type === 'single_choice') {
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((opt, i) => (
          <label key={`${q.id}-${i}`} className={cn(optionClass, invalid && 'border-danger-border')}>
            <input
              type="radio"
              name={q.id}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              aria-invalid={invalid || undefined}
              required={q.required}
              className="h-5 w-5 shrink-0 accent-[hsl(var(--brand))]"
            />
            <span className="qx-body break-words text-fg">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (q.type === 'multiple_choice') {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((opt, i) => (
          <label key={`${q.id}-${i}`} className={cn(optionClass, invalid && 'border-danger-border')}>
            <input
              type="checkbox"
              name={`${q.id}-${i}`}
              value={opt}
              checked={picked.includes(opt)}
              onChange={() => onToggle(opt)}
              aria-invalid={invalid || undefined}
              className="h-5 w-5 shrink-0 rounded accent-[hsl(var(--brand))]"
            />
            <span className="qx-body break-words text-fg">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (q.type === 'rating') {
    return (
      <RatingInput
        aria-labelledby={headingId}
        aria-describedby={errId}
        value={typeof value === 'number' ? value : null}
        onChange={(v) => onChange(v)}
        size="lg"
        register="play"
        required={q.required}
        invalid={invalid}
        lowLabel={copy.svRatingLow}
        highLabel={copy.svRatingHigh}
        getItemLabel={(v) => copy.svRatingItem(v)}
        className="w-full"
      />
    );
  }

  const text = typeof value === 'string' ? value : '';
  const left = maxText - text.length;
  const counterId = `${q.id}-counter`;
  return (
    <div className="space-y-1">
      <Textarea
        aria-labelledby={headingId}
        aria-describedby={[counterId, errId].filter(Boolean).join(' ')}
        aria-required={q.required || undefined}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={copy.svOpenPlaceholder}
        maxLength={maxText}
        rows={5}
        className="qx-body min-h-32"
      />
      <p id={counterId} className={cn('qx-caption text-right', left <= 100 ? 'text-warning' : 'text-fg-subtle')}>
        <span aria-hidden>{copy.svCharCount(text.length, maxText)}</span>
        <span className="sr-only">{copy.svCharLeft(left)}</span>
      </p>
    </div>
  );
}

function OutcomeActions({ copy, viewer, dealerId }: { copy: ShareCopy; viewer: Viewer; dealerId: string }) {
  const venuePath = `/customer/places/${dealerId}`;
  if (viewer.signedIn && viewer.role === 'CUSTOMER') {
    return (
      <>
        <Button asChild className="w-full">
          <Link href={venuePath} onClick={() => track('survey_outcome_cta', { cta: 'venue' })}>
            {copy.svGoVenue}
          </Link>
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/customer" onClick={() => track('survey_outcome_cta', { cta: 'home' })}>
            {copy.svGoHome}
          </Link>
        </Button>
      </>
    );
  }
  if (viewer.signedIn) {
    return (
      <Button asChild variant="outline" className="w-full">
        <Link href="/">{copy.goHome}</Link>
      </Button>
    );
  }
  return (
    <div className="w-full rounded-card border border-brand-border bg-brand-subtle p-4 text-left">
      <p className="qx-body font-semibold text-fg">{copy.svJoinCardTitle}</p>
      <p className="qx-small mt-1 text-fg-muted">{copy.svJoinBody}</p>
      <div className="mt-3 flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href={authHref('register', venuePath)} onClick={() => track('survey_outcome_cta', { cta: 'register' })}>
            {copy.svJoinTitle}
          </Link>
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href={authHref('login', venuePath)} onClick={() => track('survey_outcome_cta', { cta: 'login' })}>
            {copy.svLogin}
          </Link>
        </Button>
      </div>
    </div>
  );
}
