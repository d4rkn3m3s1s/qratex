'use client';

/**
 * Tara yüzeyinin istemci adası: kamera kahramanı, tam ekran vizör, elle giriş, galeriden okuma,
 * derin link (`?code=`), çözüm kartı ve kart aktivasyonu.
 *
 * Kamera yaşam döngüsü ortak `useQrScanner` kancasında (idempotent kapanış, açılış sürerken
 * kapatma, unmount temizliği — B-1/B-2). Çözüm `POST /api/customer/scan/resolve` (B-3/B-6/B-7).
 */
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { m } from 'framer-motion';
import {
  AlertTriangle,
  Camera,
  CreditCard,
  ImagePlus,
  Keyboard,
  Loader2,
  QrCode,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/states';
import { Ambient, DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useQrScanner, type QrScannerErrorCode } from '@/lib/hooks/use-qr-scanner';
import { feedbackHref, parseQrPayload } from '@/lib/qr-resolve';
import { fill, type ScanCopy } from './copy';
import { activateCard, resolveScan, type ResolveOutcome } from './resolve-client';
import { ResultSheet, type SheetState } from './result-sheet';
import type { ScanResolution, ScanRewardInfo, ScanSource } from './scan-types';
import {
  detectPlatform,
  haptic,
  isCoarsePointer,
  useCameraPermission,
  useScanCopy,
  useTrackControls,
} from './use-scan-device';
import { ViewfinderOverlay, type ViewfinderBanner, type ViewfinderPhase } from './viewfinder-overlay';

const READER_ID = 'customer-scan-reader';
const GALLERY_ID = 'customer-scan-gallery';
const BANNER_MS = 4500;
const RECOGNIZED_MS = 380;

function computeFrameSize(): number {
  if (typeof window === 'undefined') return 240;
  const w = Math.min(window.innerWidth, 480);
  return Math.round(Math.min(300, Math.max(190, w * 0.66)));
}

function failureText(copy: ScanCopy, outcome: Extract<ResolveOutcome, { ok: false }>): string {
  if (outcome.error === 'rate_limited') {
    return fill(copy.networkErrors.rate_limited, { seconds: outcome.retryAfterSec ?? 30 });
  }
  return copy.networkErrors[outcome.error];
}

/** Eyleme dönük olmayan çözüm (kamera açık kalır / alan altında gösterilir) için metin; yoksa null. */
function terminalText(copy: ScanCopy, r: ScanResolution): string | null {
  if (r.kind === 'unknown') return copy.notQratex;
  if (r.kind === 'venue' && r.status !== 'ok') return copy.venueErrors[r.status];
  if (r.kind === 'card' && r.state !== 'unused' && r.state !== 'mine') return copy.cardErrors[r.state];
  return null;
}

function sheetFor(r: ScanResolution): SheetState | null {
  if (r.kind === 'venue' && r.status === 'ok') return { type: 'venue', code: r.code, venue: r.venue };
  if (r.kind === 'card' && (r.state === 'unused' || r.state === 'mine')) {
    return { type: 'card', token: r.token, state: r.state, hasOtherCard: r.hasOtherCard, activation: 'idle', error: null };
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function ScanExperience({
  initialCode,
  reward,
  hasActiveCard,
}: {
  initialCode: string | null;
  reward: ScanRewardInfo | null;
  hasActiveCard: boolean;
}) {
  const router = useRouter();
  const { copy, locale } = useScanCopy();
  const policy = useMotionPolicy();
  const { permission, refresh: refreshPermission } = useCameraPermission();

  const [frameSize, setFrameSize] = useState(240);
  const [recognized, setRecognized] = useState(false);
  const [banner, setBanner] = useState<ViewfinderBanner | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [manualValue, setManualValue] = useState(() => {
    if (!initialCode) return '';
    const parsed = parseQrPayload(initialCode);
    return parsed.kind === 'feedback' ? parsed.code : parsed.kind === 'plain' ? parsed.value : '';
  });
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualPending, setManualPending] = useState(false);
  const [galleryPending, setGalleryPending] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [coarse, setCoarse] = useState(false);

  const lastSourceRef = useRef<ScanSource>('camera');
  const lastRequestRef = useRef<{ text: string; source: ScanSource } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusManualOnClose = useRef(false);
  /** Vizör kapanırken odağı açan düğmeye geri verme (çözüm kartı açılıyor, odak onda). */
  const skipFocusRestore = useRef(false);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const openCameraRef = useRef<HTMLButtonElement | null>(null);
  const autoStarted = useRef(false);
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    setFrameSize(computeFrameSize());
    setPlatform(detectPlatform());
    setCoarse(isCoarsePointer());
    // Birden çok kamera varsa (ön/arka) değiştirme düğmesi gösterilir; etiketler izinsiz de sayılır.
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((devices) => setCanSwitchCamera(devices.filter((d) => d.kind === 'videoinput').length > 1))
      .catch(() => setCanSwitchCamera(false));
  }, []);

  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    []
  );

  const showBanner = useCallback((text: string, tone: ViewfinderBanner['tone'] = 'warning') => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ id: Date.now(), text, tone });
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }, []);

  const openSheet = useCallback((state: SheetState, source: ScanSource) => {
    lastSourceRef.current = source;
    setSheet(state);
  }, []);

  const scanner = useQrScanner({
    elementId: READER_ID,
    fps: 10,
    qrbox: { width: frameSize, height: frameSize },
    dedupeMs: 4000,
    onDecode: async (text) => {
      const parsed = parseQrPayload(text);
      if (parsed.kind === 'unknown') {
        // Başka bir QR (menü, Wi-Fi, sosyal medya): istek yok, kamera açık kalır.
        showBanner(copy.notQratex);
        return;
      }
      lastRequestRef.current = { text, source: 'camera' };
      const outcome = await resolveScan(text, 'camera');
      if (!outcome.ok) {
        if (outcome.error === 'session') {
          skipFocusRestore.current = true;
          await scanner.stop();
          openSheet({ type: 'message', tone: 'warning', text: copy.networkErrors.session, signIn: true }, 'camera');
          return;
        }
        showBanner(failureText(copy, outcome), 'danger');
        return;
      }
      const terminal = terminalText(copy, outcome.result);
      const next = sheetFor(outcome.result);
      if (terminal || !next) {
        haptic(!policy.reduce, [15, 60, 15]);
        showBanner(terminal ?? copy.notQratex);
        return;
      }
      haptic(!policy.reduce, 30);
      setBanner(null);
      setRecognized(true);
      if (!policy.reduce) await sleep(RECOGNIZED_MS);
      skipFocusRestore.current = true;
      await scanner.stop();
      setRecognized(false);
      openSheet(next, 'camera');
    },
  });

  const controls = useTrackControls(READER_ID, scanner.status === 'scanning' || scanner.status === 'paused');

  const startCamera = useCallback(() => {
    setBanner(null);
    if (scanner.error) scanner.resetError();
    void scanner.start().finally(() => refreshPermission());
  }, [scanner, refreshPermission]);

  // İzin önceden verilmişse dokunmatik cihazda kamera kendiliğinden açılır (derin linkte değil).
  useEffect(() => {
    if (autoStarted.current || initialCode || !coarse || permission !== 'granted') return;
    autoStarted.current = true;
    startCamera();
  }, [permission, coarse, initialCode, startCamera]);

  /** Elle giriş / galeri / derin link için ortak çözüm akışı. */
  const resolveAndPresent = useCallback(
    async (text: string, source: Exclude<ScanSource, 'camera'>) => {
      lastRequestRef.current = { text, source };
      const outcome = await resolveScan(text, source);
      if (!outcome.ok) {
        const message = failureText(copy, outcome);
        if (source === 'manual' && outcome.error !== 'session') {
          setManualError(message);
          return;
        }
        openSheet(
          {
            type: 'message',
            tone: 'danger',
            text: message,
            signIn: outcome.error === 'session',
            retry: outcome.error !== 'session',
          },
          source
        );
        return;
      }
      const terminal = terminalText(copy, outcome.result);
      const next = sheetFor(outcome.result);
      if (terminal || !next) {
        if (source === 'manual') setManualError(terminal ?? copy.notQratex);
        else openSheet({ type: 'message', tone: 'warning', text: terminal ?? copy.notQratex }, source);
        return;
      }
      haptic(!policy.reduce, 30);
      setManualError(null);
      openSheet(next, source);
    },
    [copy, openSheet, policy.reduce]
  );

  // Derin link: /customer/scan?code=XXXX → çöz ve göster; adres temizlenir (yenilemede tekrar etmez).
  useEffect(() => {
    if (deepLinkHandled.current || !initialCode) return;
    deepLinkHandled.current = true;
    void resolveAndPresent(initialCode, 'link').finally(() => {
      router.replace('/customer/scan', { scroll: false });
    });
  }, [initialCode, resolveAndPresent, router]);

  const submitManual = async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      setManualError(copy.manualEmpty);
      manualInputRef.current?.focus();
      return;
    }
    setManualError(null);
    setManualPending(true);
    try {
      await resolveAndPresent(value, 'manual');
    } finally {
      setManualPending(false);
    }
  };

  const onManualPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const parsed = parseQrPayload(pasted);
    if (parsed.kind === 'feedback' || parsed.kind === 'card') {
      // Bağlantı yapıştırıldı: kodu çıkar ve hemen çöz (B-8: alan "HTTPS://" ile dolmasın).
      e.preventDefault();
      const value = parsed.kind === 'feedback' ? parsed.code : parsed.token;
      setManualValue(value);
      void submitManual(pasted);
    }
  };

  const onGalleryFile = async (file: File | undefined) => {
    if (!file) return;
    setGalleryPending(true);
    let decoded: string | null = null;
    try {
      const mod = await import('html5-qrcode');
      const reader = new mod.Html5Qrcode(GALLERY_ID, {
        verbose: false,
        formatsToSupport: [mod.Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
      });
      try {
        decoded = await reader.scanFile(file, false);
      } finally {
        try {
          reader.clear();
        } catch {
          // görsel modunda temizlenecek bir şey yok
        }
      }
    } catch {
      decoded = null;
    }
    try {
      if (!decoded) {
        openSheet({ type: 'message', tone: 'warning', text: copy.galleryNoCode }, 'gallery');
        return;
      }
      await resolveAndPresent(decoded, 'gallery');
    } finally {
      setGalleryPending(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const onActivate = async (token: string) => {
    setSheet((s) => (s?.type === 'card' ? { ...s, activation: 'pending', error: null } : s));
    const outcome = await activateCard(token);
    if (outcome.ok) {
      haptic(!policy.reduce, [30, 50, 60]);
      setSheet((s) => (s?.type === 'card' ? { ...s, activation: 'done', error: null } : s));
      router.refresh();
      return;
    }
    if (outcome.reason === 'mine') {
      setSheet((s) => (s?.type === 'card' ? { ...s, state: 'mine', activation: 'idle', error: null } : s));
      return;
    }
    if (outcome.reason === 'session') {
      setSheet({ type: 'message', tone: 'warning', text: copy.networkErrors.session, signIn: true });
      return;
    }
    const error =
      outcome.reason === 'rate_limited'
        ? fill(copy.networkErrors.rate_limited, { seconds: outcome.retryAfterSec ?? 30 })
        : outcome.reason === 'offline'
          ? copy.networkErrors.offline
          : copy.cardErrors[outcome.reason];
    setSheet((s) => (s?.type === 'card' ? { ...s, activation: 'idle', error } : s));
  };

  const closeSheet = () => setSheet(null);

  const scanAnother = () => {
    setSheet(null);
    if (permission === 'denied') {
      openCameraRef.current?.focus();
      return;
    }
    startCamera();
  };

  const retryLast = () => {
    const last = lastRequestRef.current;
    setSheet(null);
    if (!last) return;
    if (last.source === 'camera') startCamera();
    else void resolveAndPresent(last.text, last.source);
  };

  const startFeedback = (code: string) => {
    setNavigating(true);
    router.push(feedbackHref(code, lastSourceRef.current));
  };

  const typeInstead = () => {
    focusManualOnClose.current = true;
    void scanner.stop();
  };

  const status = scanner.status;
  const overlayOpen = scanner.isActive || recognized;
  const phase: ViewfinderPhase = recognized
    ? 'recognized'
    : status === 'starting'
      ? 'starting'
      : status === 'paused'
        ? 'checking'
        : 'scanning';

  const cameraError: QrScannerErrorCode | null = scanner.error?.code ?? null;
  const showDenied = cameraError === 'permission-denied' || (!cameraError && permission === 'denied');
  const busy = status === 'starting' || status === 'stopping' || galleryPending || navigating;

  return (
    <div className="space-y-4">
      {/* ── Kahraman: kamera ── */}
      <section
        aria-labelledby="scan-hero-title"
        className="relative overflow-hidden rounded-sheet border border-brand-border bg-gradient-to-br from-brand-subtle via-surface-1 to-surface-1 p-5 shadow-[var(--elevation-2)] sm:p-7"
      >
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-7 sm:text-left">
          {/* Mini vizör illüstrasyonu (dekor; azaltılmış harekette statik). */}
          <div className="relative h-32 w-32 shrink-0" aria-hidden>
            <div className="absolute inset-0 flex items-center justify-center rounded-card bg-surface-2/70">
              <QrCode className="h-14 w-14 text-brand" />
            </div>
            <Ambient className="absolute inset-0" fallback={<HeroCorners />}>
              <m.div
                className="absolute inset-0"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
              >
                <HeroCorners />
              </m.div>
            </Ambient>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <h2 id="scan-hero-title" className="text-2xl font-bold tracking-tight text-balance">
              {copy.heroTitle}
            </h2>

            {showDenied ? (
              <div role="alert" className="space-y-2 text-left">
                <p className="flex items-center gap-2 font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {copy.permissionDeniedTitle}
                </p>
                <p className="text-sm leading-relaxed text-fg-muted">{copy.permissionDeniedBody}</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-fg">
                  {copy.permissionGuide[platform].map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : cameraError ? (
              <InlineError variant="banner" className="text-left">
                {copy.cameraErrors[cameraError]}
              </InlineError>
            ) : permission === 'prompt' ? (
              <div className="space-y-1 text-left sm:text-left">
                <p className="text-sm font-semibold text-fg">{copy.permissionPromptTitle}</p>
                <p className="text-sm leading-relaxed text-fg-muted text-pretty">{copy.permissionPromptBody}</p>
              </div>
            ) : (
              <p className="leading-relaxed text-fg-muted text-pretty">{coarse ? copy.heroBody : copy.heroBodyDesktop}</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                ref={openCameraRef}
                size="lg"
                className="min-h-12 flex-1 gap-2 text-base touch-manipulation sm:flex-none"
                onClick={startCamera}
                disabled={busy}
                aria-busy={status === 'starting'}
              >
                {status === 'starting' ? (
                  <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : cameraError || showDenied ? (
                  <RotateCw className="h-5 w-5" aria-hidden />
                ) : (
                  <Camera className="h-5 w-5" aria-hidden />
                )}
                {status === 'starting' ? copy.openingCamera : cameraError || showDenied ? copy.retry : copy.openCamera}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="min-h-12 gap-2 touch-manipulation"
                onClick={() => galleryInputRef.current?.click()}
                disabled={busy}
                aria-busy={galleryPending}
              >
                {galleryPending ? (
                  <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <ImagePlus className="h-5 w-5" aria-hidden />
                )}
                {galleryPending ? copy.readingImage : copy.fromGallery}
              </Button>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => void onGalleryFile(e.target.files?.[0])}
              />
            </div>

            <p className="flex items-start gap-1.5 text-xs text-fg-muted sm:items-center">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0" aria-hidden />
              {copy.privacyNote}
            </p>
          </div>
        </div>
      </section>

      {/* ── Elle giriş ── */}
      <m.section
        aria-labelledby="scan-manual-title"
        initial={policy.reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={policy.transition({ duration: DURATION.slow, ease: EASE.emphasized, delay: 0.06 })}
        className="rounded-card border border-subtle bg-surface-1 p-5 shadow-[var(--elevation-1)]"
      >
        <h2 id="scan-manual-title" className="flex items-center gap-2 text-lg font-semibold">
          <Keyboard className="h-5 w-5 text-fg-muted" aria-hidden />
          {copy.manualTitle}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{copy.manualBody}</p>
        <form
          className="mt-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submitManual(manualValue);
          }}
        >
          <label htmlFor="scan-manual-input" className="text-sm font-medium">
            {copy.manualLabel}
          </label>
          <div className="mt-1.5 flex items-stretch gap-2">
            <Input
              id="scan-manual-input"
              ref={manualInputRef}
              value={manualValue}
              onChange={(e) => {
                setManualValue(e.target.value.replace(/\s+/g, ''));
                if (manualError) setManualError(null);
              }}
              onPaste={onManualPaste}
              placeholder={copy.manualPlaceholder}
              className="min-h-12 min-w-0 flex-1 font-mono text-lg sm:text-lg uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal"
              maxLength={512}
              inputMode="text"
              enterKeyHint="go"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              error={!!manualError}
              errorId="scan-manual-error"
            />
            <Button
              type="submit"
              size="lg"
              className="min-h-12 shrink-0 gap-2 px-5 touch-manipulation"
              disabled={manualPending || navigating}
              aria-busy={manualPending}
            >
              {manualPending ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {copy.manualSubmit}
            </Button>
          </div>
          <InlineError id="scan-manual-error">{manualError}</InlineError>
        </form>
      </m.section>

      {/* ── Kart bağlama ipucu (aktif kartı olmayanlara) ── */}
      {!hasActiveCard && (
        <m.section
          aria-labelledby="scan-card-hint-title"
          initial={policy.reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={policy.transition({ duration: DURATION.slow, ease: EASE.emphasized, delay: 0.12 })}
          className="flex flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-5 sm:flex-row sm:items-center"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-brand" aria-hidden>
            <CreditCard className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="scan-card-hint-title" className="font-semibold">
              {copy.cardHintTitle}
            </h2>
            <p className="text-sm text-fg-muted">{copy.cardHintBody}</p>
          </div>
          <Button variant="outline" className="min-h-11 gap-2 touch-manipulation" onClick={startCamera} disabled={busy}>
            <Camera className="h-4 w-4" aria-hidden />
            {copy.cardHintAction}
          </Button>
        </m.section>
      )}

      {/* Galeriden okuma için görünmez kap (html5-qrcode bir kap kimliği ister). */}
      <div id={GALLERY_ID} className="hidden" aria-hidden />

      <ViewfinderOverlay
        open={overlayOpen}
        readerId={READER_ID}
        status={status}
        phase={phase}
        frameSize={frameSize}
        banner={banner}
        copy={copy}
        controls={controls}
        canSwitchCamera={canSwitchCamera}
        onClose={() => void scanner.stop()}
        onSwitchCamera={() => void scanner.switchCamera()}
        onTypeInstead={typeInstead}
        onCloseAutoFocus={(e) => {
          if (skipFocusRestore.current) {
            skipFocusRestore.current = false;
            e.preventDefault();
            return;
          }
          if (focusManualOnClose.current) {
            focusManualOnClose.current = false;
            e.preventDefault();
            manualInputRef.current?.focus();
          }
        }}
      />

      <ResultSheet
        state={sheet}
        reward={reward}
        copy={copy}
        locale={locale}
        navigating={navigating}
        onClose={closeSheet}
        onStartFeedback={startFeedback}
        onScanAnother={scanAnother}
        onActivate={(token) => void onActivate(token)}
        onRetry={retryLast}
      />
    </div>
  );
}

function HeroCorners() {
  const base = 'absolute h-7 w-7 border-brand';
  return (
    <>
      <span className={cn(base, 'left-0 top-0 rounded-tl-xl border-l-[3px] border-t-[3px]')} />
      <span className={cn(base, 'right-0 top-0 rounded-tr-xl border-r-[3px] border-t-[3px]')} />
      <span className={cn(base, 'bottom-0 left-0 rounded-bl-xl border-b-[3px] border-l-[3px]')} />
      <span className={cn(base, 'bottom-0 right-0 rounded-br-xl border-b-[3px] border-r-[3px]')} />
    </>
  );
}
