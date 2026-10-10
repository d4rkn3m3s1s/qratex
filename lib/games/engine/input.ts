/**
 * Giriş soyutlaması — klavye, kaydırma (swipe), işaretçi (fare/dokunma/kalem) ve sanal
 * D-pad TEK olay akışında (oyun-ekosistemi Y4).
 *
 * Kural: sanal kontroller ekran GENİŞLİĞİNE göre değil `(pointer: coarse)` medya
 * sorgusuna göre gösterilir (`isCoarsePointer`). Böylece ≥ 640 px dokunmatik cihazlar
 * (iPad) da kontrol alır — eski `sm:hidden` hatası (review-stack) yapısal olarak kapanır.
 * İşaretçi olayları (Pointer Events) fare ve dokunmayı birlikte kapsar; genişlik koşulu yok.
 *
 * Basılı tutma tekrarı: klavyede işletim sisteminin tekrarı (`repeat: true`), sanal
 * D-pad'de `repeatDelayMs` sonra `repeatIntervalMs` aralıkla tekrarlı `press`.
 */

export type GameAction = 'up' | 'down' | 'left' | 'right' | 'primary' | 'secondary' | 'pause';
export type Direction = 'up' | 'down' | 'left' | 'right';

export const GAME_ACTIONS: readonly GameAction[] = ['up', 'down', 'left', 'right', 'primary', 'secondary', 'pause'];

/** Varsayılan tuş eşlemi (`KeyboardEvent.code`). */
export const DEFAULT_KEYMAP: Readonly<Record<string, GameAction>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'primary',
  Enter: 'primary',
  KeyX: 'secondary',
  ShiftLeft: 'secondary',
  Escape: 'pause',
  KeyP: 'pause',
};

export type GameInputEvent =
  | { type: 'press'; action: GameAction; repeat: boolean; source: 'keyboard' | 'virtual' }
  | { type: 'release'; action: GameAction; source: 'keyboard' | 'virtual' }
  | { type: 'swipe'; direction: Direction }
  | {
      type: 'pointer';
      phase: 'down' | 'move' | 'up' | 'cancel';
      /** Mantıksal koordinat (`toLogical` verildiyse), değilse hedefe göre CSS piksel. */
      x: number;
      y: number;
      pointerId: number;
      pointerType: string;
    };

/** Kaydırma yönü (eşik altı → null). Saf fonksiyon. */
export function swipeDirection(dx: number, dy: number, threshold = 24): Direction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Kaba işaretçi (dokunmatik) cihaz mı? Sanal kontrolleri göstermek için tek ölçüt. */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== 'string') return false;
  const el = t as HTMLElement;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export interface GameInputOptions {
  /** İşaretçi/kaydırma hedefi (oyun alanı). */
  target: HTMLElement;
  onInput: (e: GameInputEvent) => void;
  /** Klavye dinleyicisi (varsayılan window). `null` → klavye kapalı. */
  keyboardTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  keymap?: Readonly<Record<string, GameAction>>;
  /** Kaydırma algılama. Varsayılan true. */
  swipe?: boolean;
  swipeThreshold?: number;
  /** Ham işaretçi olayları (sürükleme/nişan). Varsayılan true. */
  pointer?: boolean;
  /** Viewport → mantıksal koordinat (genelde `CanvasSurface.toLogical`). */
  toLogical?: (clientX: number, clientY: number) => { x: number; y: number };
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
  /** Ok tuşları/boşluk sayfayı kaydırmasın. Varsayılan true. */
  preventDefaultKeys?: boolean;
}

export interface GameInput {
  /** Sanal D-pad / buton basışı (basılı tutma tekrarıyla). */
  press(action: GameAction): void;
  release(action: GameAction): void;
  /** Eylem şu an basılı mı (klavye ya da sanal). */
  held(action: GameAction): boolean;
  /** Tüm basılı durumları bırakır (duraklatmada). */
  releaseAll(): void;
  dispose(): void;
}

export function createGameInput(opts: GameInputOptions): GameInput {
  const keymap = opts.keymap ?? DEFAULT_KEYMAP;
  const swipeOn = opts.swipe !== false;
  const pointerOn = opts.pointer !== false;
  const threshold = opts.swipeThreshold ?? 24;
  const repeatDelay = opts.repeatDelayMs ?? 220;
  const repeatInterval = opts.repeatIntervalMs ?? 70;
  const preventKeys = opts.preventDefaultKeys !== false;
  const kb = opts.keyboardTarget === undefined ? (typeof window !== 'undefined' ? window : null) : opts.keyboardTarget;

  const heldKeys = new Map<GameAction, number>(); // eylem → basılı kaynak sayısı
  const virtualTimers = new Map<GameAction, { delay: ReturnType<typeof setTimeout> | null; every: ReturnType<typeof setInterval> | null }>();
  const starts = new Map<number, { x: number; y: number }>();

  const hold = (a: GameAction) => heldKeys.set(a, (heldKeys.get(a) ?? 0) + 1);
  const unhold = (a: GameAction) => {
    const n = (heldKeys.get(a) ?? 0) - 1;
    if (n <= 0) heldKeys.delete(a);
    else heldKeys.set(a, n);
  };

  const logical = (clientX: number, clientY: number) => {
    if (opts.toLogical) return opts.toLogical(clientX, clientY);
    const r = opts.target.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onKeyDown = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (isTypingTarget(e.target)) return;
    const action = keymap[e.code];
    if (!action) return;
    if (preventKeys) e.preventDefault();
    if (!e.repeat) hold(action);
    opts.onInput({ type: 'press', action, repeat: e.repeat === true, source: 'keyboard' });
  };
  const onKeyUp = (ev: Event) => {
    const e = ev as KeyboardEvent;
    const action = keymap[e.code];
    if (!action) return;
    unhold(action);
    opts.onInput({ type: 'release', action, source: 'keyboard' });
  };

  const onPointerDown = (ev: Event) => {
    const e = ev as PointerEvent;
    starts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      opts.target.setPointerCapture?.(e.pointerId);
    } catch {
      /* yakalama desteklenmiyor */
    }
    if (pointerOn) {
      const p = logical(e.clientX, e.clientY);
      opts.onInput({ type: 'pointer', phase: 'down', x: p.x, y: p.y, pointerId: e.pointerId, pointerType: e.pointerType });
    }
  };
  const onPointerMove = (ev: Event) => {
    if (!pointerOn) return;
    const e = ev as PointerEvent;
    const p = logical(e.clientX, e.clientY);
    opts.onInput({ type: 'pointer', phase: 'move', x: p.x, y: p.y, pointerId: e.pointerId, pointerType: e.pointerType });
  };
  const onPointerUp = (ev: Event) => {
    const e = ev as PointerEvent;
    const s = starts.get(e.pointerId);
    starts.delete(e.pointerId);
    if (pointerOn) {
      const p = logical(e.clientX, e.clientY);
      opts.onInput({ type: 'pointer', phase: 'up', x: p.x, y: p.y, pointerId: e.pointerId, pointerType: e.pointerType });
    }
    if (swipeOn && s) {
      const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y, threshold);
      if (dir) opts.onInput({ type: 'swipe', direction: dir });
    }
  };
  const onPointerCancel = (ev: Event) => {
    const e = ev as PointerEvent;
    starts.delete(e.pointerId);
    if (pointerOn) {
      opts.onInput({ type: 'pointer', phase: 'cancel', x: 0, y: 0, pointerId: e.pointerId, pointerType: e.pointerType });
    }
  };

  kb?.addEventListener('keydown', onKeyDown);
  kb?.addEventListener('keyup', onKeyUp);
  const t = opts.target;
  // Kaydırma/sürükleme oyunlarında sayfa kaymasın (dokunma hedefi).
  const prevTouchAction = t.style.touchAction;
  if (swipeOn || pointerOn) t.style.touchAction = 'none';
  t.addEventListener('pointerdown', onPointerDown);
  t.addEventListener('pointermove', onPointerMove);
  t.addEventListener('pointerup', onPointerUp);
  t.addEventListener('pointercancel', onPointerCancel);

  const stopVirtual = (a: GameAction) => {
    const tm = virtualTimers.get(a);
    if (tm) {
      if (tm.delay) clearTimeout(tm.delay);
      if (tm.every) clearInterval(tm.every);
      virtualTimers.delete(a);
    }
  };

  const api: GameInput = {
    press(action) {
      if (virtualTimers.has(action)) return;
      hold(action);
      opts.onInput({ type: 'press', action, repeat: false, source: 'virtual' });
      if (action === 'pause') {
        virtualTimers.set(action, { delay: null, every: null });
        return;
      }
      const entry: { delay: ReturnType<typeof setTimeout> | null; every: ReturnType<typeof setInterval> | null } = {
        delay: null,
        every: null,
      };
      entry.delay = setTimeout(() => {
        entry.every = setInterval(() => {
          opts.onInput({ type: 'press', action, repeat: true, source: 'virtual' });
        }, repeatInterval);
      }, repeatDelay);
      virtualTimers.set(action, entry);
    },
    release(action) {
      if (!virtualTimers.has(action)) return;
      stopVirtual(action);
      unhold(action);
      opts.onInput({ type: 'release', action, source: 'virtual' });
    },
    held(action) {
      return (heldKeys.get(action) ?? 0) > 0;
    },
    releaseAll() {
      for (const a of Array.from(virtualTimers.keys())) stopVirtual(a);
      heldKeys.clear();
      starts.clear();
    },
    dispose() {
      api.releaseAll();
      kb?.removeEventListener('keydown', onKeyDown);
      kb?.removeEventListener('keyup', onKeyUp);
      t.removeEventListener('pointerdown', onPointerDown);
      t.removeEventListener('pointermove', onPointerMove);
      t.removeEventListener('pointerup', onPointerUp);
      t.removeEventListener('pointercancel', onPointerCancel);
      t.style.touchAction = prevTouchAction;
    },
  };
  return api;
}
