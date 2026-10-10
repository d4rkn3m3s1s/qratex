'use client';

/**
 * Motorun React kancaları. Saf çekirdek (`loop.ts`, `canvas.ts`, `input.ts`, `rng.ts`,
 * `record.ts`) React'tan bağımsızdır; sunucu doğrulayıcısı ve testler onları doğrudan kullanır.
 *
 * Proje kuralı (minigames-architecture "canvas retry-guard"): canvas ref'i ilk karede
 * henüz bağlı olmayabilir; kancalar `active` true olduğunda ref'i bekler, yoksa bir
 * sonraki karede yeniden dener.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { createFixedStepLoop, type FixedStepLoop, type FixedStepLoopOptions, type PauseReason } from './loop';
import { setupCanvas, type CanvasSurface, type CanvasSurfaceOptions } from './canvas';
import { createGameInput, isCoarsePointer, type GameInput, type GameInputEvent, type GameInputOptions } from './input';
import { getGamePrefs, getServerGamePrefs, setGamePrefs, subscribeGamePrefs, type GamePrefs } from './prefs';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Her render'daki en güncel değeri tutan ref (render sırasında ref yazmadan). */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useIsoLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export interface UseGameLoopOptions extends Omit<FixedStepLoopOptions, 'onPauseChange' | 'env'> {
  /** Döngü yalnız true iken çalışır (ör. `phase === 'playing'`). */
  active: boolean;
  /** Dışarıdan duraklatma (kabuk menüsü açık). */
  paused?: boolean;
  /** Döngü kendiliğinden duraklayınca (sekme gizlendi) kabuğa haber ver. */
  onAutoPause?: (reason: PauseReason) => void;
}

/**
 * Sabit adımlı döngü kancası. `update`/`render` her render'da yenilenebilir; döngü
 * en güncellerini ref üzerinden çağırır (bayat kapanış hatası — bot-hunter — oluşmaz).
 */
export function useGameLoop(opts: UseGameLoopOptions): {
  loopRef: RefObject<FixedStepLoop | null>;
  /** Toplam mantık adımı (deterministik zaman; girdi kaydı için). */
  getStep: () => number;
} {
  const loopRef = useRef<FixedStepLoop | null>(null);
  const updateRef = useLatestRef(opts.update);
  const renderRef = useLatestRef(opts.render);
  const autoPauseRef = useLatestRef(opts.onAutoPause);

  const { active, hz, maxStepsPerFrame, maxFrameMs, autoPause } = opts;

  useEffect(() => {
    if (!active) return;
    const loop = createFixedStepLoop({
      hz,
      maxStepsPerFrame,
      maxFrameMs,
      autoPause,
      update: (dt, step) => updateRef.current(dt, step),
      render: (alpha) => renderRef.current?.(alpha),
      onPauseChange: (paused, reason) => {
        if (paused && reason && reason !== 'host') autoPauseRef.current?.(reason);
      },
    });
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      if (loopRef.current === loop) loopRef.current = null;
    };
  }, [active, hz, maxStepsPerFrame, maxFrameMs, autoPause, updateRef, renderRef, autoPauseRef]);

  // Kabuk duraklatması (menü) ↔ döngü.
  const paused = opts.paused === true;
  useEffect(() => {
    const loop = loopRef.current;
    if (!loop) return;
    if (paused) loop.pause('host');
    else if (loop.paused) loop.resume();
  }, [paused, active]);

  const getStep = useCallback(() => loopRef.current?.step ?? 0, []);
  return { loopRef, getStep };
}

/** DPR'lı canvas yüzeyi kancası (ResizeObserver dahil). */
export function useCanvasSurface(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: CanvasSurfaceOptions & { active?: boolean }
): RefObject<CanvasSurface | null> {
  const surfaceRef = useRef<CanvasSurface | null>(null);
  const { width, height, maxDpr, alpha } = opts;
  const active = opts.active !== false;
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) {
      // Canvas henüz bağlanmadı → bir sonraki karede yeniden dene (retry-guard).
      const id = requestAnimationFrame(() => setRetry((n) => n + 1));
      return () => cancelAnimationFrame(id);
    }
    const s = setupCanvas(canvas, { width, height, maxDpr, alpha });
    surfaceRef.current = s;
    return () => {
      s.dispose();
      if (surfaceRef.current === s) surfaceRef.current = null;
    };
  }, [active, canvasRef, width, height, maxDpr, alpha, retry]);

  return surfaceRef;
}

/** Giriş soyutlaması kancası. `onInput` en güncel kapanışla çağrılır. */
export function useGameInput(
  targetRef: RefObject<HTMLElement | null>,
  opts: Omit<GameInputOptions, 'target' | 'onInput'> & { active?: boolean; onInput: (e: GameInputEvent) => void }
): RefObject<GameInput | null> {
  const inputRef = useRef<GameInput | null>(null);
  const onInputRef = useLatestRef(opts.onInput);
  const toLogicalRef = useLatestRef(opts.toLogical);
  const active = opts.active !== false;
  const { keymap, swipe, swipeThreshold, pointer, repeatDelayMs, repeatIntervalMs, preventDefaultKeys, keyboardTarget } = opts;
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!active) return;
    const target = targetRef.current;
    if (!target) {
      const id = requestAnimationFrame(() => setRetry((n) => n + 1));
      return () => cancelAnimationFrame(id);
    }
    const input = createGameInput({
      target,
      keymap,
      swipe,
      swipeThreshold,
      pointer,
      repeatDelayMs,
      repeatIntervalMs,
      preventDefaultKeys,
      keyboardTarget,
      toLogical: (x, y) => (toLogicalRef.current ? toLogicalRef.current(x, y) : { x, y }),
      onInput: (e) => onInputRef.current(e),
    });
    inputRef.current = input;
    return () => {
      input.dispose();
      if (inputRef.current === input) inputRef.current = null;
    };
  }, [active, targetRef, keymap, swipe, swipeThreshold, pointer, repeatDelayMs, repeatIntervalMs, preventDefaultKeys, keyboardTarget, retry, onInputRef, toLogicalRef]);

  return inputRef;
}

const noopSubscribe = () => () => {};

/** Dokunmatik (kaba işaretçi) cihaz mı — sanal kontrolleri göstermek için. SSR: false. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return noopSubscribe();
      const mq = window.matchMedia('(pointer: coarse)');
      const any = window.matchMedia('(any-pointer: coarse)');
      mq.addEventListener?.('change', cb);
      any.addEventListener?.('change', cb);
      return () => {
        mq.removeEventListener?.('change', cb);
        any.removeEventListener?.('change', cb);
      };
    },
    isCoarsePointer,
    () => false
  );
}

/** Oyun ses/titreşim tercihleri (kalıcı, sekmeler arası senkron). */
export function useGamePrefs(): [GamePrefs, (patch: Partial<GamePrefs>) => void] {
  const prefs = useSyncExternalStore(subscribeGamePrefs, getGamePrefs, getServerGamePrefs);
  const update = useCallback((patch: Partial<GamePrefs>) => {
    setGamePrefs(patch);
  }, []);
  return [prefs, update];
}
