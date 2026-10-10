'use client';

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { m as Motion } from 'framer-motion';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  MIN_DISMISS_MS,
  SCENE_DURATION_MS,
  SCENE_EXIT_MS,
  STAGE_READY_TIMEOUT_MS,
  createSceneClock,
  nextFocusIndex,
  reducedSceneDurationMs,
  upcomingMarks,
  type SceneClock,
  type SceneKind,
} from './scene-math';

/**
 * An Motoru sahne kabuğu — seviye / lig / rozet sahnelerinin ortak iskeleti.
 *
 *  • Zaman: duraklatılabilen `SceneClock`. 3B sahne ilk karesini çizince (ya da en geç
 *    `STAGE_READY_TIMEOUT_MS` sonra; 3B yoksa hemen) başlar. Sekme gizlenince durur,
 *    görünür olunca kaldığı yerden sürer. DOM metinleri `marks` işaretlerinde yeniden
 *    çizilir (rAF yok); 3B sahne aynı saati her karede okur → senkron.
 *  • Kapanış: süre dolunca, Esc ile ya da dokunuşla (ilk `MIN_DISMISS_MS` içindeki kazara
 *    dokunuş sayılmaz). Kısa çıkış solması, sonra `onDone()` TAM BİR KEZ.
 *  • Erişilebilirlik: `role="dialog"` + `aria-modal`, duyuru `role="status"` +
 *    `aria-live="polite"`, odak tuzağı (Tab/Shift+Tab kap içinde döner), kapanınca odak
 *    önceki öğeye döner. Azaltılmış harekette çağıran sahne sade kart çizer; kabuk
 *    yalnız opaklık geçişi yapar ve kartı okunabilir süre (≥ 5 sn) tutar.
 */
export interface SceneShellApi {
  clock: SceneClock;
  /** Son işaret anındaki geçen süre (ms). DOM metinleri buna göre görünür. */
  elapsed: number;
  /** Saat başladı mı (3B hazır / zaman aşımı / azaltılmış). */
  started: boolean;
  reduce: boolean;
  /** 3B sahne hazır ya da kullanılamaz → saati başlat. */
  stageSettled: () => void;
  close: () => void;
  /** Başlık öğesinin id'si (`aria-labelledby`). */
  titleId: string;
}

export interface SceneShellProps {
  kind: SceneKind;
  /** fullscreen: tam ekran set; card: karartılmış zeminde orta kart. */
  variant: 'fullscreen' | 'card';
  /** Ekran okuyucu duyurusu (saat başlayınca bir kez). */
  announce: string;
  /** DOM'un yeniden çizileceği zaman çizelgesi işaretleri (ms). */
  marks: readonly number[];
  onDone: () => void;
  children: (api: SceneShellApi) => ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

export function SceneShell({ kind, variant, announce, marks, onDone, children, className }: SceneShellProps) {
  const reduce = useReducedMotionPref();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [clock] = useState<SceneClock>(createSceneClock);

  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [closing, setClosing] = useState(false);
  const [live, setLive] = useState('');
  const mountedAtRef = useRef(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const durationMs = reduce ? reducedSceneDurationMs(kind) : SCENE_DURATION_MS[kind];

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  const close = useCallback(() => {
    setClosing(true);
  }, []);

  // Kapanış: çıkış solması bitince (ya da emniyet süresi dolunca) onDone.
  useEffect(() => {
    if (!closing) return;
    const guard = window.setTimeout(finish, SCENE_EXIT_MS + 400);
    return () => window.clearTimeout(guard);
  }, [closing, finish]);

  const startClock = useCallback(() => {
    if (clock.started()) return;
    const now = performance.now();
    clock.start(now);
    if (typeof document !== 'undefined' && document.hidden) clock.pause(now);
    setStarted(true);
    setRunning(clock.running());
    setElapsed(0);
  }, [clock]);

  // Başlatma: azaltılmışta hemen; değilse 3B hazır olunca ya da zaman aşımında.
  useEffect(() => {
    mountedAtRef.current = performance.now();
    if (reduce) {
      startClock();
      return;
    }
    const t = window.setTimeout(startClock, STAGE_READY_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // Yalnız ilk bağlanmada: tercih sahne ortasında değişirse saat yeniden başlamaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Duyuru: saat başlayınca bir kez (boş → dolu geçişi ekran okuyucuya okunur).
  useEffect(() => {
    if (started) setLive(announce);
  }, [started, announce]);

  // İşaretler + otomatik kapanma (saat çalışırken).
  const marksKey = marks.join(',');
  useEffect(() => {
    if (!started || !running || closing) return;
    const now = performance.now();
    const el = clock.elapsedMs(now);
    setElapsed(el);
    if (el >= durationMs) {
      close();
      return;
    }
    const timers = upcomingMarks([...marks, durationMs], el).map(({ mark, inMs }) =>
      window.setTimeout(() => {
        setElapsed(mark);
        if (mark >= durationMs) close();
      }, inMs),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, running, closing, marksKey, durationMs, clock, close]);

  // Sekme gizlenince saat durur; görünür olunca sürer.
  useEffect(() => {
    const onVis = () => {
      const now = performance.now();
      if (document.hidden) {
        clock.pause(now);
      } else {
        clock.resume(now);
      }
      setRunning(clock.running());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [clock]);

  // Odak: içeri al, kapanınca geri ver.
  useEffect(() => {
    const prev = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const root = rootRef.current;
    const preferred = root?.querySelector<HTMLElement>('[data-scene-autofocus]');
    try {
      (preferred ?? root)?.focus({ preventScroll: true });
    } catch {
      /* yoksay */
    }
    return () => {
      try {
        if (prev && prev.isConnected && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
      } catch {
        /* yoksay */
      }
    };
  }, []);

  // Klavye: Esc kapatır; Tab kap içinde döner (odak tuzağı).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = rootRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
      );
      e.preventDefault();
      if (items.length === 0) {
        root.focus({ preventScroll: true });
        return;
      }
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const next = nextFocusIndex(items.length, idx, e.shiftKey);
      items[next]?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close]);

  const onPointerDismiss = (e: ReactMouseEvent) => {
    // Bağlantı/düğme kendi işini yapar (düğmeler zaten close çağırır).
    const target = e.target as HTMLElement | null;
    if (target?.closest('a,button')) return;
    if (performance.now() - mountedAtRef.current < MIN_DISMISS_MS) return;
    close();
  };

  const api: SceneShellApi = { clock, elapsed, started, reduce, stageSettled: startClock, close, titleId };

  return (
    <Motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-moment-scene={kind}
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={
        closing
          ? { duration: reduce ? DURATION.fast : SCENE_EXIT_MS / 1000, ease: EASE.exit }
          : { duration: reduce ? DURATION.fast : DURATION.base, ease: EASE.emphasized }
      }
      onAnimationComplete={() => {
        if (closing) finish();
      }}
      onClick={onPointerDismiss}
      className={cn(
        'fixed inset-0 z-modal outline-none',
        variant === 'fullscreen' ? 'overflow-hidden' : 'grid place-items-center overflow-y-auto bg-overlay/70 p-4 backdrop-blur-sm',
        closing && 'pointer-events-none',
        className,
      )}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </p>
      {children(api)}
    </Motion.div>
  );
}
