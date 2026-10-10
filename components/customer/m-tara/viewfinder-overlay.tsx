'use client';

/**
 * Tam ekran vizör — kamera açıkken ekranı kaplayan koyu katman (Radix Dialog: odak tuzağı,
 * Esc ile kapanış, kapanınca odak açan düğmeye döner).
 *
 * Kap (`readerId`) yalnız katman açıkken DOM'dadır; ortak tarama kancasının denetleyicisi
 * başlatırken kabı en fazla 1,5 sn bekler (defaultWaitForElement), açılışla aynı karede gelir.
 *
 * html5-qrcode'un kendi gölgeli bölgesi ve "Scanner paused" yazısı gizlenir (kabın doğrudan
 * `div` çocukları); çerçeve, gölge ve durum bu bileşende çizilir.
 */
import { useId, useRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { m } from 'framer-motion';
import { Check, Flashlight, FlashlightOff, Keyboard, Loader2, SwitchCamera, X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Ambient, DURATION, EASE, SPRING, useMotionPolicy } from '@/lib/motion';
import type { QrScannerStatus } from '@/lib/hooks/use-qr-scanner';
import type { ScanCopy } from './copy';
import type { TrackControls } from './use-scan-device';

export type ViewfinderPhase = 'starting' | 'scanning' | 'checking' | 'recognized';

export interface ViewfinderBanner {
  id: number;
  tone: 'warning' | 'danger';
  text: string;
}

const CONTROL =
  'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm ' +
  'transition-colors duration-fast ease-standard hover:bg-black/70 touch-manipulation ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black ' +
  'disabled:opacity-50 aria-pressed:bg-white aria-pressed:text-black';

function Corners({ tone }: { tone: 'idle' | 'success' }) {
  const color = tone === 'success' ? 'border-success' : 'border-white';
  const base = cn('absolute h-9 w-9 transition-colors duration-fast ease-standard', color);
  return (
    <>
      <span className={cn(base, 'left-0 top-0 rounded-tl-2xl border-l-4 border-t-4')} />
      <span className={cn(base, 'right-0 top-0 rounded-tr-2xl border-r-4 border-t-4')} />
      <span className={cn(base, 'bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4')} />
      <span className={cn(base, 'bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4')} />
    </>
  );
}

export function ViewfinderOverlay({
  open,
  readerId,
  status,
  phase,
  frameSize,
  banner,
  copy,
  controls,
  canSwitchCamera,
  onClose,
  onSwitchCamera,
  onTypeInstead,
  onCloseAutoFocus,
  footer,
}: {
  open: boolean;
  readerId: string;
  status: QrScannerStatus;
  phase: ViewfinderPhase;
  frameSize: number;
  banner: ViewfinderBanner | null;
  copy: ScanCopy;
  controls: TrackControls;
  canSwitchCamera: boolean;
  onClose: () => void;
  onSwitchCamera: () => void;
  onTypeInstead: () => void;
  /** Kapanışta odak hedefi (ör. "Kodu elle gir" → giriş alanı); varsayılan: açan düğme. */
  onCloseAutoFocus?: (event: Event) => void;
  footer?: ReactNode;
}) {
  const policy = useMotionPolicy();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const hintId = useId();
  const recognized = phase === 'recognized';

  const statusText =
    phase === 'starting'
      ? copy.viewfinderStarting
      : phase === 'checking'
        ? copy.viewfinderChecking
        : phase === 'recognized'
          ? copy.viewfinderRecognized
          : copy.viewfinderHint;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={hintId}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          className="dark fixed inset-0 z-modal flex flex-col bg-black text-white outline-none [color-scheme:dark]"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <DialogPrimitive.Title className="sr-only">{copy.viewfinderTitle}</DialogPrimitive.Title>

          {/* Üst çubuk */}
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <DialogPrimitive.Close asChild>
              <button ref={closeRef} type="button" className={CONTROL} aria-label={copy.closeCamera}>
                <X className="h-6 w-6" aria-hidden />
              </button>
            </DialogPrimitive.Close>
            <div className="flex items-center gap-2">
              {controls.torchSupported && (
                <button
                  type="button"
                  className={CONTROL}
                  aria-pressed={controls.torchOn}
                  aria-label={controls.torchOn ? copy.torchOff : copy.torchOn}
                  onClick={() => void controls.toggleTorch()}
                >
                  {controls.torchOn ? (
                    <FlashlightOff className="h-5 w-5" aria-hidden />
                  ) : (
                    <Flashlight className="h-5 w-5" aria-hidden />
                  )}
                </button>
              )}
              {canSwitchCamera && (
                <button
                  type="button"
                  className={CONTROL}
                  aria-label={copy.switchCamera}
                  disabled={status === 'starting' || status === 'stopping'}
                  onClick={onSwitchCamera}
                >
                  <SwitchCamera className="h-5 w-5" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {/* Vizör */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-0 py-4 sm:px-4">
            <div className="relative w-full max-w-[30rem] overflow-hidden bg-black sm:rounded-sheet">
              <div
                id={readerId}
                aria-label={copy.viewfinderTitle}
                role="img"
                className="min-h-[18rem] w-full [&>div]:!hidden [&_video]:block [&_video]:!w-full"
              />

              {/* Çerçeve + dış gölge (konum dış sarmalayıcıda, hareket içte). */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative" style={{ width: frameSize, height: frameSize }}>
                  <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]" />
                  {recognized ? (
                    <m.div
                      className="absolute inset-0"
                      initial={{ scale: 1.06 }}
                      animate={{ scale: 1 }}
                      transition={policy.transition({ duration: DURATION.fast, ease: EASE.emphasized })}
                    >
                      <Corners tone="success" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
                          <Check className="h-9 w-9" aria-hidden />
                        </span>
                      </span>
                    </m.div>
                  ) : (
                    <Ambient className="absolute inset-0" fallback={<Corners tone="idle" />}>
                      <m.div
                        className="absolute inset-0"
                        animate={{ scale: [1, 1.025, 1] }}
                        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
                      >
                        <Corners tone="idle" />
                      </m.div>
                    </Ambient>
                  )}
                </div>
              </div>

              {(phase === 'starting' || phase === 'checking') && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-9 w-9 animate-spin text-white motion-reduce:animate-none" aria-hidden />
                </div>
              )}
            </div>

            <p id={hintId} role="status" aria-live="polite" className="mt-4 px-6 text-center text-base font-medium">
              {statusText}
            </p>

            <div className="mt-3 min-h-[3.5rem] w-full max-w-[30rem] px-4" aria-live="assertive">
              {banner && (
                <m.p
                  key={banner.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={policy.transition(SPRING.snappy)}
                  className={cn(
                    'rounded-control border px-4 py-3 text-sm leading-relaxed',
                    banner.tone === 'danger'
                      ? 'border-danger-border bg-danger-subtle text-danger'
                      : 'border-warning-border bg-warning-subtle text-warning'
                  )}
                >
                  {banner.text}
                </m.p>
              )}
            </div>
          </div>

          {/* Alt çubuk */}
          <div className="space-y-3 px-4 pb-4">
            {controls.zoom && (
              <label className="mx-auto flex w-full max-w-[30rem] items-center gap-3 text-sm">
                <ZoomIn className="h-5 w-5 shrink-0" aria-hidden />
                <span className="sr-only">{copy.zoom}</span>
                <input
                  type="range"
                  min={controls.zoom.min}
                  max={controls.zoom.max}
                  step={controls.zoom.step}
                  value={controls.zoomValue}
                  onChange={(e) => void controls.setZoom(Number(e.target.value))}
                  className="h-11 w-full cursor-pointer accent-white"
                />
                <span className="w-12 text-right tabular-nums">{controls.zoomValue.toFixed(1)}×</span>
              </label>
            )}
            <div className="mx-auto flex w-full max-w-[30rem] flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onTypeInstead}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-medium text-white transition-colors duration-fast hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white touch-manipulation"
              >
                <Keyboard className="h-4 w-4" aria-hidden />
                {copy.typeInstead}
              </button>
              {footer}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
