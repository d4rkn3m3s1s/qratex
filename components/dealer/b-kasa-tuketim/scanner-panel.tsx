'use client';

/**
 * Kasa tarayıcısı — ortak `useQrScanner` (D1) kancası: kilit/duraklatma/teardown ve bayat
 * kapanım koruması kancada; burada yalnız sunum + manuel kod. Kamera katmanı sayfa içinde
 * kalır (tam ekran örtü yok → hata/sonuç kartı kameranın arkasında kalmaz).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Camera, CameraOff, Loader2, ScanLine, SwitchCamera, AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { useMotionPolicy, DURATION, EASE } from '@/lib/motion';
import { useQrScanner, QR_SCANNER_ERROR_KEYS } from '@/lib/hooks/use-qr-scanner';
import { useAppT } from '@/lib/app-locale';
import { extractCardToken } from '@/lib/qr-scan-targets';
import { useKasaCopy } from './copy';

export interface ScannerPanelHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const READER_ID = 'kasa-qr-reader';
const SOUND_KEY = 'qx:kasa-sound';

export function ScannerPanel({
  onToken,
  busy,
  lookupError,
  onDismissError,
  registerHandle,
}: {
  /** Kart kodu bulundu → doğrula. true dönerse kamera kapanır. */
  onToken: (token: string) => Promise<boolean>;
  busy: boolean;
  lookupError: { message: string; action?: { label: string; run: () => void } } | null;
  onDismissError: () => void;
  registerHandle: (h: ScannerPanelHandle) => void;
}) {
  const { copy } = useKasaCopy();
  const c = copy.kasa;
  const t = useAppT();
  const policy = useMotionPolicy();
  const [sound, setSound] = useState(true);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [notCard, setNotCard] = useState(false);
  const [lockPulse, setLockPulse] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const manualId = useId();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOUND_KEY) === '0') setSound(false);
    } catch {
      /* yoksay */
    }
    return () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    };
  }, []);

  const toggleSound = () => {
    setSound((s) => {
      try {
        window.localStorage.setItem(SOUND_KEY, s ? '0' : '1');
      } catch {
        /* yoksay */
      }
      return !s;
    });
  };

  const feedback = () => {
    if (policy.allowCelebrate && typeof navigator.vibrate === 'function') navigator.vibrate(30);
    setLockPulse((n) => n + 1);
    if (!sound) return;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!audioRef.current || audioRef.current.state === 'closed') audioRef.current = new Ctor();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1000;
      gain.gain.value = 0.25;
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      /* ses isteğe bağlı */
    }
  };

  const scanner = useQrScanner({
    elementId: READER_ID,
    fps: 10,
    qrbox: { width: 240, height: 240 },
    aspectRatio: 1,
    dedupeMs: 4000,
    onDecode: async (text) => {
      const token = extractCardToken(text);
      if (!token) {
        setNotCard(true);
        return;
      }
      setNotCard(false);
      feedback();
      const found = await onToken(token);
      if (found) await scanner.stop();
    },
  });

  useEffect(() => {
    registerHandle({ start: scanner.start, stop: scanner.stop });
  }, [registerHandle, scanner.start, scanner.stop]);

  const active = scanner.isActive;
  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!manual.trim()) {
      setManualError(c.manual.required);
      return;
    }
    const token = extractCardToken(manual);
    if (!token) {
      setManualError(c.manual.invalid);
      return;
    }
    setManualError(null);
    void onToken(token).then((found) => {
      if (found) {
        setManual('');
        void scanner.stop();
      }
    });
  };

  const statusText =
    busy || scanner.status === 'paused'
      ? c.camera.checking
      : scanner.status === 'starting'
        ? c.camera.starting
        : scanner.status === 'scanning'
          ? c.camera.scanning
          : null;

  return (
    <section aria-label={c.camera.region} className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-surface-muted qx-elevation-1 sm:aspect-[4/3] lg:aspect-square">
        <div id={READER_ID} className={cn('h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover', !active && 'hidden')} />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <ScanLine className="h-10 w-10 text-fg-subtle" aria-hidden />
            <p className="font-medium">{c.camera.idleTitle}</p>
            <p className="max-w-xs text-sm text-fg-muted">{c.camera.idleHint}</p>
            <Button onClick={() => void scanner.start()} disabled={scanner.status === 'stopping'} className="mt-1 min-h-14 gap-2 px-6 text-base">
              <Camera className="h-4 w-4" aria-hidden />
              {c.camera.open}
            </Button>
          </div>
        )}
        {(scanner.status === 'starting' || busy) && active && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
          </div>
        )}
        {/* Kilitlenme anı: kısa çerçeve vurgusu (azaltılmış harekette yok). */}
        <AnimatePresence>
          {lockPulse > 0 && !policy.reduce && (
            <Motion.div
              key={lockPulse}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-inset ring-success"
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE.standard }}
            />
          )}
        </AnimatePresence>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-fg-muted">
        {notCard && active ? c.camera.notACard : statusText}
      </p>

      {scanner.error && (
        <InlineError
          variant="banner"
          onRetry={() => {
            scanner.resetError();
            void scanner.start();
          }}
        >
          {t(QR_SCANNER_ERROR_KEYS[scanner.error.code])}
        </InlineError>
      )}

      {lookupError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger-border bg-danger-subtle p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <p>{lookupError.message}</p>
            <div className="flex flex-wrap gap-2">
              {lookupError.action && (
                <Button size="sm" variant="outline" className="min-h-11" onClick={lookupError.action.run}>
                  {lookupError.action.label}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="min-h-11" onClick={onDismissError}>
                {copy.common.close}
              </Button>
            </div>
          </div>
        </div>
      )}

      {active && (
        <div className="flex gap-2">
          <Button onClick={() => void scanner.stop()} variant="outline" className="min-h-11 flex-1 gap-2">
            <CameraOff className="h-4 w-4" aria-hidden />
            {c.camera.close}
          </Button>
          <Button
            onClick={() => void scanner.switchCamera()}
            variant="outline"
            className="min-h-11 min-w-11"
            aria-label={c.camera.flip}
            title={c.camera.flip}
            disabled={scanner.status === 'starting'}
          >
            <SwitchCamera className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            onClick={toggleSound}
            variant="outline"
            className="min-h-11 min-w-11"
            aria-label={sound ? c.camera.soundOff : c.camera.soundOn}
            title={sound ? c.camera.soundOff : c.camera.soundOn}
            aria-pressed={!sound}
          >
            {sound ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      )}

      <form onSubmit={submitManual} className="space-y-1.5 border-t border-border pt-3" noValidate>
        <Label htmlFor={manualId} className="text-sm">
          {c.manual.label}
        </Label>
        <div className="flex gap-2">
          <Input
            id={manualId}
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              if (manualError) setManualError(null);
            }}
            placeholder={c.manual.placeholder}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-h-11"
            aria-invalid={!!manualError}
            aria-describedby={manualError ? `${manualId}-err` : undefined}
          />
          <Button type="submit" className="min-h-11 shrink-0" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {c.manual.submit}
          </Button>
        </div>
        {manualError && (
          <p id={`${manualId}-err`} className="text-sm text-danger">
            {manualError}
          </p>
        )}
      </form>
    </section>
  );
}
