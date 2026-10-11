'use client';

/**
 * QR geri bildirim hunisi — istemci adası (ürünün kalbi).
 *
 * Akış (rapor "Yeniden tasarım vizyonu"): 1) yıldız → 2) bağlamsal etiketler + isteğe bağlı
 * personel / yorum / fotoğraf / NPS → 3) ödül anı. Mekân, oturum ve ödül önizlemesi
 * sunucudan gelir (ilk HTML'de); bu ada yalnız girdi, gönderim ve kutlamayı yönetir.
 *
 * Dayanıklılık: taslak sessionStorage'da (giriş dönüşü kaybolmaz), her gönderim tek
 * `Idempotency-Key` taşır (yeniden dene çift kayıt üretmez), ağ yoksa yorum cihazda kuyruğa
 * alınır ve bağlantı gelince gönderilir. Hata türü sınıflanır (429 geri sayım, 413, 5xx).
 */
import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, Info, Loader2, LogIn, MessageSquareHeart, RotateCw, Send, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLocale } from '@/lib/app-locale';
import { RatingInput } from '@/components/ds/a11y/rating-input';
import { ChoiceChips } from '@/components/ds/a11y/choice-chips';
import { announce } from '@/components/ds/a11y/live-region';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useMotionPolicy } from '@/lib/motion/use-reduced-motion-pref';
import { moments } from '@/lib/moments/client';
import { track } from '@/lib/analytics';
import { INPUT_LIMITS } from '@/lib/input-limits';
import { MAX_QUICK_TAGS, normalizeQuickTags, quickTagLabel, tagsForRating } from '@/lib/feedback-funnel/quick-tags';
import { MAX_FEEDBACK_PHOTOS } from '@/lib/feedback-funnel/constants';
import type { SubmitFeedbackBody, SubmitFeedbackResult } from '@/lib/feedback-funnel/schema';
import { getFunnelCopy, type FunnelCopy, type FunnelLocale } from './copy';
import { postFeedback, postScan, type ApiResult } from './api';
import { addClaim, clearDraft, enqueueOutbox, loadDraft, newIdempotencyKey, saveDraft, type FunnelDraft } from './storage';
import { usePhotoUploads } from './use-photo-uploads';
import { useOutbox } from './use-outbox';
import type { FunnelOutcome } from './success-panel';
import { btnPrimary, btnSecondary } from './button-styles';
import { VenueBar, VenueMark, type StepIndex } from './venue-bar';
import type { FeedbackFunnelProps } from './types';

// Huni bütçesi (≤ 150 KB gzip ilk JS): yalnız sonraki adımlarda görünen parçalar ayrı yüklenir.
// Fotoğraf seçici ve başarı paneli ilk yıldız seçiminde ısıtılır (gönderimde beklemesin,
// çevrimdışı kuyruğa düşüşte de hazır olsun); talep bandı yalnız oturumlu müşteride çizilir.
const loadPhotoPicker = () => import('@/components/ds/a11y/photo-picker');
const loadSuccessPanel = () => import('./success-panel');
const PhotoPicker = dynamic(() => loadPhotoPicker().then((m) => m.PhotoPicker));
const SuccessPanel = dynamic(() => loadSuccessPanel().then((m) => m.SuccessPanel));
const ClaimBanner = dynamic(() => import('./claim-banner').then((m) => m.ClaimBanner));
let laterStepsWarmed = false;
function warmLaterSteps() {
  if (laterStepsWarmed) return;
  laterStepsWarmed = true;
  void loadPhotoPicker().catch(() => {
    laterStepsWarmed = false;
  });
  void loadSuccessPanel().catch(() => {
    laterStepsWarmed = false;
  });
}

type Step = 'rating' | 'details' | 'done';
const STEP_INDEX: Record<Step, StepIndex> = { rating: 0, details: 1, done: 2 };

type SubmitError = { message: string; retryable: boolean; canQueue: boolean; retryAt: number | null };

function errorFor(res: Extract<ApiResult<unknown>, { ok: false }>, copy: FunnelCopy): SubmitError {
  switch (res.kind) {
    case 'rate_limited': {
      const sec = res.retryAfterSec ?? 60;
      return { message: copy.errRateLimited(sec), retryable: true, canQueue: false, retryAt: Date.now() + sec * 1000 };
    }
    case 'too_large':
      return { message: copy.errTooLarge, retryable: false, canQueue: false, retryAt: null };
    case 'server':
      return { message: copy.errServer, retryable: true, canQueue: true, retryAt: null };
    case 'network':
      return { message: copy.errNetwork, retryable: true, canQueue: true, retryAt: null };
    default:
      return { message: res.message ?? copy.errGeneric, retryable: res.kind !== 'not_found', canQueue: false, retryAt: null };
  }
}

function useCountdown(until: number | null): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

export function FeedbackFunnel(props: FeedbackFunnelProps) {
  const { venue, viewer, preview, photosEnabled, attribution, claimIntent, selfPath } = props;
  const { locale: appLocale, setLocale } = useAppLocale();
  const locale: FunnelLocale = appLocale === 'en' ? 'en' : 'tr';
  const copy = getFunnelCopy(locale);
  const policy = useMotionPolicy();
  const reduce = policy.reduce;

  // ── Taslaktan başlangıç (yalnız istemcide; SSR ile uyum için ilk render boş) ──
  const [hydrated, setHydrated] = React.useState(false);
  const [step, setStep] = React.useState<Step>('rating');
  const [rating, setRating] = React.useState<number | null>(null);
  const [text, setText] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [npsScore, setNpsScore] = React.useState<number | null>(null);
  const [staffId, setStaffId] = React.useState<string | null>(null);
  const [idemKey, setIdemKey] = React.useState('');
  const [initialMedia, setInitialMedia] = React.useState<FunnelDraft['media']>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<SubmitError | null>(null);
  const [outcome, setOutcome] = React.useState<FunnelOutcome | null>(null);
  const [outboxNote, setOutboxNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    const d = loadDraft(venue.code);
    if (d) {
      const r = typeof d.rating === 'number' && d.rating >= 1 && d.rating <= 5 ? d.rating : null;
      setStep(r ? d.step : 'rating');
      setRating(r);
      setText(d.text);
      setTags(normalizeQuickTags(d.tags));
      setNpsScore(d.npsScore);
      setStaffId(venue.staff.some((s) => s.id === d.staffId) ? d.staffId : null);
      setInitialMedia(Array.isArray(d.media) ? d.media : []);
      setIdemKey(d.idemKey || newIdempotencyKey());
    } else {
      setIdemKey(newIdempotencyKey());
    }
    setHydrated(true);
    // Tarama olayı: sayfa başına bir kez (sunucu 30 dk tekilleştirir). İşletmenin kendi
    // sahibi/personeli QR'ı önizlerken `qr_scanned` / `scanCount` şişirilmez.
    if (preview?.mode !== 'insider') postScan(venue.code, attribution);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız ilk yükleme
  }, []);

  const photos = usePhotoUploads(venue.code);
  const restorePhotos = photos.restore;
  React.useEffect(() => {
    if (initialMedia.length) restorePhotos(initialMedia);
  }, [initialMedia, restorePhotos]);

  // ── Taslağı kaydet ──
  React.useEffect(() => {
    if (!hydrated || step === 'done' || !idemKey) return;
    saveDraft(venue.code, { step, rating, text, tags, npsScore, staffId, media: photos.doneMedia, idemKey });
  }, [hydrated, step, rating, text, tags, npsScore, staffId, photos.doneMedia, idemKey, venue.code]);

  const outbox = useOutbox((n) => {
    setOutboxNote(copy.outboxSent(n));
    announce(copy.outboxSent(n));
  });

  // ── Adım geçişinde odak başlığa ──
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (step !== 'rating') warmLaterSteps();
    // Ayrı yüklenen panel (başarı) bir kare geç bağlanabilir: başlık gelene kadar kısa süre bekle.
    let tries = 0;
    let raf = 0;
    const focusHeading = () => {
      if (headingRef.current) headingRef.current.focus();
      else if (tries++ < 30) raf = window.requestAnimationFrame(focusHeading);
    };
    focusHeading();
    return () => window.cancelAnimationFrame(raf);
  }, [step]);

  // ── Yıldız: işaretçiyle seçimde kendiliğinden ilerle (klavyede oklar seçimi değiştirir, ilerletmez) ──
  const lastPointer = React.useRef(0);
  const advanceTimer = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
  }, []);
  const onRate = (v: number) => {
    warmLaterSteps();
    setRating(v);
    setTags((prev) => {
      const allowed = new Set(tagsForRating(v).map((t) => t.id));
      return prev.filter((id) => allowed.has(id));
    });
    announce(copy.ratingLabels[v - 1] ?? String(v));
    if (Date.now() - lastPointer.current < 600) {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      advanceTimer.current = window.setTimeout(() => setStep('details'), reduce ? 150 : 450);
    }
  };

  const toggleLocale = () => setLocale(locale === 'tr' ? 'en' : 'tr');

  const retryIn = useCountdown(error?.retryAt ?? null);

  // ── Gönderim ──
  const buildBody = (): SubmitFeedbackBody => ({
    rating: rating ?? 0,
    text: text.trim() || undefined,
    tags,
    npsScore,
    staffId,
    media: photos.doneMedia.map((m) => m.url),
    attribution,
  });

  const finish = (result: SubmitFeedbackResult) => {
    clearDraft(venue.code);
    const r = result.reward;
    if (r.status === 'claimable') {
      addClaim({ token: r.claimToken, code: venue.code, venueName: venue.businessName, points: r.points, expiresAt: r.expiresAt });
    }
    track('feedback_submitted', {
      rating,
      hasText: !!text.trim(),
      tags: tags.length,
      hasMedia: photos.doneMedia.length > 0,
      hasNps: npsScore != null,
      rewardStatus: r.status,
      pointsEarned: r.status === 'credited' || r.status === 'capped' ? r.points : null,
      leveledUp: r.status === 'credited' || r.status === 'capped' ? r.leveledUp : false,
    });
    setOutcome({ kind: 'sent', reward: r });
    setStep('done');
    announce(copy.successTitle);
    if (r.status === 'credited' || r.status === 'capped') {
      // An Motoru: puan kapsülü + bekleyen büyük anlar (seviye/lig/rozet sunucuda kayıtlı, tam bir kez).
      const shown = r.points > 0 || r.xp > 0 ? moments.points({ points: r.points, xp: r.xp }) : true;
      moments.refresh();
      if (!shown && policy.allowCelebrate) void import('@/lib/moments/effects').then((fx) => fx.confetti('burst')).catch(() => {});
    } else if (policy.allowCelebrate && r.status !== 'conflict') {
      void import('@/lib/moments/effects').then((fx) => fx.confetti('burst')).catch(() => {});
    }
  };

  const queue = () => {
    enqueueOutbox({
      idemKey,
      code: venue.code,
      venueName: venue.businessName,
      body: { ...buildBody(), attribution: { ...attribution, source: attribution.source ?? 'qr' } },
      createdAt: Date.now(),
    });
    clearDraft(venue.code);
    outbox.refreshPending();
    setError(null);
    setOutcome({ kind: 'queued', offline: typeof navigator !== 'undefined' && navigator.onLine === false });
    setStep('done');
    announce(copy.successQueuedTitle);
  };

  const submit = async () => {
    if (!rating || submitting || photos.uploadingCount > 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      queue();
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await postFeedback(venue.code, buildBody(), idemKey);
    setSubmitting(false);
    if (res.ok) {
      finish(res.data);
      return;
    }
    if (res.kind === 'network') {
      // Bağlantı koptu: yorum kaybolmasın — cihazda sıraya al.
      queue();
      return;
    }
    const e = errorFor(res, copy);
    setError(e);
    announce(e.message, { politeness: 'assertive' });
  };

  // ── Görünüm ──
  const subtitle = [venue.spotName, venue.locationName].filter(Boolean).join(' · ') || null;
  const ratingTags = tagsForRating(rating);
  const showClaimBanner = viewer.signedIn && viewer.role === 'CUSTOMER';
  const loginHref = `/auth/login?callbackUrl=${encodeURIComponent(selfPath)}`;
  const ownLen = text.trim().length;

  const pane = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -24 },
    transition: { duration: reduce ? 0 : DURATION.base, ease: EASE.standard },
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface-0">
      <VenueBar
        name={venue.businessName}
        logoUrl={venue.logoUrl}
        subtitle={subtitle}
        step={STEP_INDEX[step]}
        copy={copy}
        onToggleLocale={toggleLocale}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'mx-auto w-full max-w-lg flex-1 px-4 pt-5 outline-none',
          // Sabit alt çubuk (hata + düğmeler + KVKK satırı) son alanı örtmesin; bitti adımında çubuk yok.
          step === 'done' ? 'pb-10' : 'pb-[calc(env(safe-area-inset-bottom)+14rem)]'
        )}
      >
        <div className="space-y-3">
          {outboxNote && (
            <p className="flex items-center gap-2 rounded-control border border-success-border bg-success-subtle px-3 py-2 qx-small text-fg">
              <Send aria-hidden className="h-4 w-4 shrink-0 text-success" />
              {outboxNote}
            </p>
          )}
          {outbox.pending > 0 && step !== 'done' && (
            <p className="flex items-center gap-2 rounded-control border border-warning-border bg-warning-subtle px-3 py-2 qx-small text-fg">
              <WifiOff aria-hidden className="h-4 w-4 shrink-0 text-warning" />
              {copy.outboxPending(outbox.pending)}
            </p>
          )}
        </div>
        {showClaimBanner && (
          <div className="mb-4 mt-1">
            <ClaimBanner code={venue.code} copy={copy} auto={claimIntent} />
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {step === 'rating' && (
            <Motion.section key="rating" {...pane} aria-labelledby="fb-q" className="flex flex-col items-center gap-6 pt-4 text-center">
              <VenueMark name={venue.businessName} logoUrl={venue.logoUrl} size="lg" />
              <div className="space-y-2">
                <h1 id="fb-q" ref={headingRef} tabIndex={-1} className="qx-h1 text-balance text-fg outline-none">
                  {copy.ratingQuestion(venue.businessName)}
                </h1>
                {venue.welcomeText ? (
                  <p className="qx-body text-fg-muted">{venue.welcomeText}</p>
                ) : venue.description ? (
                  <p className="qx-body text-fg-muted">{venue.description}</p>
                ) : (
                  <p className="qx-small text-fg-muted">{copy.ratingHint}</p>
                )}
              </div>

              <div onPointerUp={() => (lastPointer.current = Date.now())}>
                <RatingInput
                  aria-label={copy.ratingAria}
                  value={rating}
                  onChange={onRate}
                  size="lg"
                  register="play"
                  getItemLabel={(v) => `${v} / 5 — ${copy.ratingLabels[v - 1]}`}
                />
              </div>
              <p className="min-h-6 qx-body font-semibold text-fg" aria-hidden>
                {rating ? copy.ratingLabels[rating - 1] : ''}
              </p>

              <RewardPreviewNote preview={preview} copy={copy} loginHref={loginHref} />
            </Motion.section>
          )}

          {step === 'details' && rating && (
            <Motion.section key="details" {...pane} aria-labelledby="fb-details" className="space-y-6">
              <div className="space-y-1">
                <h1 id="fb-details" ref={headingRef} tabIndex={-1} className="qx-h2 text-fg outline-none">
                  {copy.detailsTitle}
                </h1>
                <p className="qx-small text-fg-muted">
                  <span className="font-semibold text-fg">
                    {'★'.repeat(rating)}
                    <span className="text-fg-subtle">{'★'.repeat(5 - rating)}</span>
                  </span>{' '}
                  <span className="sr-only">{`${rating} / 5`}</span>
                  {copy.ratingLabels[rating - 1]} · {copy.detailsOptional}
                </p>
              </div>

              {rating <= 2 && (
                <p className="flex items-start gap-2 rounded-card border border-info-border bg-info-subtle p-3 qx-small text-fg">
                  <MessageSquareHeart aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                  <span>
                    {copy.lowRatingNote} {viewer.signedIn ? copy.lowRatingMember : copy.lowRatingGuest}
                  </span>
                </p>
              )}

              {ratingTags.length > 0 && (
                <fieldset className="space-y-2">
                  <legend id="fb-tags" className="qx-body font-semibold text-fg">
                    {copy.tagsLabel(rating)}
                  </legend>
                  <p className="qx-caption text-fg-muted">{copy.tagsHint(MAX_QUICK_TAGS)}</p>
                  <ChoiceChips
                    aria-labelledby="fb-tags"
                    mode="multiple"
                    max={MAX_QUICK_TAGS}
                    options={ratingTags.map((t) => ({ value: t.id, label: quickTagLabel(t.id, locale) }))}
                    value={tags}
                    onChange={(next) => setTags(normalizeQuickTags(next))}
                  />
                </fieldset>
              )}

              {venue.staff.length > 0 && (
                <fieldset className="space-y-2">
                  <legend id="fb-staff" className="qx-body font-semibold text-fg">
                    {copy.staffLabel}
                  </legend>
                  <p className="qx-caption text-fg-muted">{copy.staffHint}</p>
                  <ChoiceChips
                    aria-labelledby="fb-staff"
                    mode="single"
                    deselectable
                    scroll
                    options={venue.staff.map((s) => ({
                      value: s.id,
                      label: s.firstName,
                      icon: s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- personel avatarı harici URL
                        <img src={s.image} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 qx-caption font-semibold">
                          {s.firstName.charAt(0).toLocaleUpperCase('tr-TR')}
                        </span>
                      ),
                    }))}
                    value={staffId}
                    onChange={setStaffId}
                  />
                </fieldset>
              )}

              <div className="space-y-2">
                <label htmlFor="fb-text" className="qx-body font-semibold text-fg">
                  {copy.commentLabel}
                </label>
                <textarea
                  id="fb-text"
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, INPUT_LIMITS.feedbackText))}
                  placeholder={copy.commentPlaceholder(rating)}
                  rows={4}
                  maxLength={INPUT_LIMITS.feedbackText}
                  aria-describedby="fb-text-meta"
                  className={cn(
                    'block w-full resize-y rounded-control border border-strong bg-surface-1 px-3 py-2.5 qx-body text-fg',
                    'placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                  )}
                />
                <div id="fb-text-meta" className="flex items-start justify-between gap-3 qx-caption text-fg-muted">
                  <DetailHint preview={preview} copy={copy} ownLen={ownLen} />
                  <span className="qx-num shrink-0">{copy.charCount(text.length, INPUT_LIMITS.feedbackText)}</span>
                </div>
              </div>

              {photosEnabled && (
                <div className="space-y-2">
                  <p id="fb-photos" className="qx-body font-semibold text-fg">
                    {copy.photosLabel}
                  </p>
                  <p id="fb-photos-hint" className="qx-caption text-fg-muted">
                    {copy.photosHint}
                  </p>
                  <PhotoPicker
                    aria-labelledby="fb-photos"
                    aria-describedby="fb-photos-hint"
                    value={photos.photos}
                    onChange={photos.onChange}
                    maxFiles={MAX_FEEDBACK_PHOTOS}
                    maxOutputBytes={1.5 * 1024 * 1024}
                    resize={{ maxDimension: 1600, quality: 0.82 }}
                  />
                  {photos.uploadingCount > 0 && (
                    <p role="status" className="flex items-center gap-2 qx-small text-fg-muted">
                      <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
                      {copy.photoUploading} <span className="qx-num">%{photos.avgProgress}</span>
                    </p>
                  )}
                  {photos.failedCount > 0 && (
                    <div role="alert" className="flex flex-wrap items-center gap-2 qx-small text-danger">
                      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
                      <span>{photos.anyOffline ? copy.photoOffline : copy.photoUploadFailed}</span>
                      <button
                        type="button"
                        onClick={photos.retryFailed}
                        className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 font-semibold text-brand hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        <RotateCw aria-hidden className="h-4 w-4" />
                        {copy.photoRetry}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <fieldset className="space-y-3">
                <legend id="fb-nps" className="qx-body font-semibold text-fg">
                  {copy.npsQuestion(venue.businessName)}
                </legend>
                <RatingInput
                  aria-labelledby="fb-nps"
                  scale="nps"
                  value={npsScore}
                  onChange={setNpsScore}
                  lowLabel={copy.npsLow}
                  highLabel={copy.npsHigh}
                  className="w-full"
                />
                {npsScore != null && (
                  <button
                    type="button"
                    onClick={() => setNpsScore(null)}
                    className="inline-flex min-h-11 items-center rounded-control px-2 qx-small font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {copy.npsClear}
                  </button>
                )}
              </fieldset>
            </Motion.section>
          )}

          {step === 'done' && outcome && (
            <Motion.section key="done" {...pane}>
              <SuccessPanel
                outcome={outcome}
                copy={copy}
                venueName={venue.businessName}
                viewer={viewer}
                selfPath={selfPath}
                reduce={reduce}
                headingRef={headingRef}
              />
            </Motion.section>
          )}
        </AnimatePresence>
      </main>

      {step !== 'done' && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-subtle bg-surface-1 qx-elevation-2">
          <div className="mx-auto w-full max-w-lg space-y-2 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
            {error && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2 qx-small text-fg">
                <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-danger" />
                <span className="flex-1">{error.retryAt && retryIn === 0 ? copy.errRateLimitedShort : error.retryAt ? copy.errRateLimited(retryIn) : error.message}</span>
                {error.canQueue && (
                  <button
                    type="button"
                    onClick={queue}
                    className="inline-flex min-h-11 items-center rounded-control px-2 font-semibold text-brand hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {copy.queueNow}
                  </button>
                )}
              </div>
            )}
            {step === 'rating' ? (
              <button type="button" className={btnPrimary} disabled={!rating} onClick={() => setStep('details')}>
                {copy.continue}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" className={cn(btnSecondary, 'w-auto px-3')} onClick={() => setStep('rating')} disabled={submitting}>
                  <ArrowLeft aria-hidden className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">{copy.back}</span>
                </button>
                <button
                  type="button"
                  className={cn(btnPrimary, 'flex-1')}
                  onClick={() => void submit()}
                  disabled={submitting || photos.uploadingCount > 0 || (error?.retryAt != null && retryIn > 0)}
                  aria-busy={submitting || undefined}
                >
                  {submitting || photos.uploadingCount > 0 ? (
                    <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
                  ) : error?.retryable ? (
                    <RotateCw aria-hidden className="h-4 w-4" />
                  ) : (
                    <Send aria-hidden className="h-4 w-4" />
                  )}
                  {submitting ? copy.submitting : photos.uploadingCount > 0 ? copy.submitWaitPhotos : error?.retryable ? copy.retry : copy.submit}
                </button>
              </div>
            )}
            {step === 'details' && (
              <p className="text-center qx-caption text-fg-muted">
                {copy.kvkk}{' '}
                <Link href="/kvkk-aydinlatma-metni" target="_blank" rel="noopener" className="font-medium text-brand underline underline-offset-2">
                  {copy.kvkkLink}
                </Link>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RewardPreviewNote({
  preview,
  copy,
  loginHref,
}: {
  preview: FeedbackFunnelProps['preview'];
  copy: FunnelCopy;
  loginHref: string;
}) {
  if (!preview) return null;
  if (preview.mode === 'insider') {
    return (
      <p className="flex items-start gap-2 rounded-card border border-warning-border bg-warning-subtle p-3 text-left qx-small text-fg">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        {copy.previewInsider}
      </p>
    );
  }
  if (preview.mode === 'guest') {
    return (
      <div className="w-full rounded-card border border-subtle bg-surface-1 p-3 text-left">
        <p className="qx-small text-fg">
          {copy.previewGuest(preview.basePoints)} <span className="text-fg-muted">{copy.previewGuestAfter}</span>
        </p>
        <Link
          href={loginHref}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 qx-small font-semibold text-brand hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <LogIn aria-hidden className="h-4 w-4" />
          {copy.signInToEarn}
        </Link>
      </div>
    );
  }
  const capReached = preview.remainingToday <= 0;
  return (
    <div className="w-full rounded-card border border-brand-border bg-brand-subtle p-3 text-left">
      <p className="qx-small font-semibold text-fg">
        {capReached ? copy.previewCapReached : copy.previewMember(Math.min(preview.basePoints, preview.remainingToday), Math.min(preview.detailedPoints, preview.remainingToday), preview.threshold)}
      </p>
      {!capReached && <p className="mt-0.5 qx-caption text-fg-muted">{copy.previewCapLeft(preview.remainingToday)}</p>}
    </div>
  );
}

function DetailHint({ preview, copy, ownLen }: { preview: FeedbackFunnelProps['preview']; copy: FunnelCopy; ownLen: number }) {
  if (!preview || preview.mode === 'insider') return <span />;
  const bonus = preview.detailedPoints;
  if (bonus <= preview.basePoints) return <span />;
  if (preview.mode === 'member' && preview.remainingToday <= 0) return <span />;
  const left = Math.max(0, preview.threshold - ownLen);
  if (left === 0) {
    return <span className="font-medium text-success">{preview.mode === 'guest' ? copy.detailGuestReached(bonus) : copy.detailReached(bonus)}</span>;
  }
  if (ownLen === 0) return <span />;
  return <span>{copy.detailProgress(left, bonus)}</span>;
}
