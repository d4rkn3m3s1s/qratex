/**
 * Sabit adımlı oyun döngüsü (yol haritası F4.2, oyun-ekosistemi Y4).
 *
 *   mantık  → `update(dtSec, step)` HER ZAMAN sabit adımla (varsayılan 60 Hz) çağrılır;
 *             120/144 Hz ekranda oyun hızlanmaz, 30 Hz'de yavaşlamaz.
 *   çizim   → `render(alpha)` her rAF karesinde bir kez; `alpha` ∈ [0,1) iki mantık adımı
 *             arası ara değerleme oranıdır (isteğe bağlı yumuşatma).
 *
 * Görünmezken duraklar: sekme gizlenince (`visibilitychange`) ya da pencere odağı
 * kaybolunca (`blur`) döngü `pause('hidden' | 'blur')` olur; kendiliğinden DEVAM ETMEZ —
 * oyuncu duraklatma menüsünden "Devam" der (geri döndüğünde can kaybı sürprizi yok).
 *
 * Spiral koruması: tek karede en fazla `maxStepsPerFrame` adım; bir kare `maxFrameMs`'den
 * uzunsa (ör. hata ayıklayıcı durdurdu) fazlası atılır.
 *
 * Deterministik zaman: `step` sayacı (toplam mantık adımı) replay için zaman birimidir;
 * girdi kaydı (`record.ts`) olayları adım numarasıyla yazar. Duvar saati KULLANILMAZ.
 *
 * DOM'a doğrudan bağlı değildir: `env` ile sahte rAF/saat/belge verilebilir (testler).
 */

export type PauseReason = 'user' | 'hidden' | 'blur' | 'host';

export interface LoopEnv {
  raf: (cb: (t: number) => void) => number;
  caf: (id: number) => void;
  now: () => number;
  /** visibilitychange kaynağı (yoksa gizlenme izlenmez). */
  doc?: {
    hidden: boolean;
    addEventListener(type: 'visibilitychange', cb: () => void): void;
    removeEventListener(type: 'visibilitychange', cb: () => void): void;
  } | null;
  /** blur kaynağı. */
  win?: {
    addEventListener(type: 'blur', cb: () => void): void;
    removeEventListener(type: 'blur', cb: () => void): void;
  } | null;
}

export interface FixedStepLoopOptions {
  /** Sabit mantık adımı. `dtSec` = 1 / hz. `step` = bu çağrıdan önceki toplam adım sayısı. */
  update: (dtSec: number, step: number) => void;
  /** Kare çizimi; `alpha` = artık birikim / adım. */
  render?: (alpha: number) => void;
  /** Mantık frekansı (Hz). Varsayılan 60. */
  hz?: number;
  /** Tek karede en fazla mantık adımı. Varsayılan 8. */
  maxStepsPerFrame?: number;
  /** Tek karenin hesaba katılan en uzun süresi (ms). Varsayılan 250. */
  maxFrameMs?: number;
  /** Gizlenme/odak kaybında otomatik duraklat. Varsayılan true. */
  autoPause?: boolean;
  /** Duraklama durumu değişince (oyun HUD'u / kabuk menüsü için). */
  onPauseChange?: (paused: boolean, reason: PauseReason | null) => void;
  env?: Partial<LoopEnv>;
}

export interface FixedStepLoop {
  start(): void;
  /** Döngüyü tamamen durdurur ve dinleyicileri kaldırır (yeniden `start` edilebilir). */
  stop(): void;
  pause(reason?: PauseReason): void;
  resume(): void;
  readonly running: boolean;
  readonly paused: boolean;
  readonly pauseReason: PauseReason | null;
  /** Toplam mantık adımı (deterministik zaman). */
  readonly step: number;
  /** Simülasyon zamanı (ms) = step × adım süresi. */
  readonly simTimeMs: number;
  /** Testler için: bir rAF karesini elle ilerletir. */
  tick(nowMs: number): void;
}

function defaultEnv(): LoopEnv {
  const hasWindow = typeof window !== 'undefined';
  return {
    raf: hasWindow && typeof window.requestAnimationFrame === 'function'
      ? (cb) => window.requestAnimationFrame(cb)
      : (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number,
    caf: hasWindow && typeof window.cancelAnimationFrame === 'function'
      ? (id) => window.cancelAnimationFrame(id)
      : (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    doc: typeof document !== 'undefined' ? document : null,
    win: hasWindow ? window : null,
  };
}

export function createFixedStepLoop(opts: FixedStepLoopOptions): FixedStepLoop {
  const env: LoopEnv = { ...defaultEnv(), ...(opts.env ?? {}) } as LoopEnv;
  const hz = opts.hz && opts.hz > 0 ? opts.hz : 60;
  const stepMs = 1000 / hz;
  const dtSec = 1 / hz;
  const maxSteps = Math.max(1, opts.maxStepsPerFrame ?? 8);
  const maxFrameMs = Math.max(stepMs, opts.maxFrameMs ?? 250);
  const autoPause = opts.autoPause !== false;

  let running = false;
  let paused = false;
  let pauseReason: PauseReason | null = null;
  let rafId: number | null = null;
  let last: number | null = null;
  let acc = 0;
  let step = 0;

  const schedule = () => {
    if (rafId === null && running && !paused) rafId = env.raf(frame);
  };

  function advance(nowMs: number) {
    if (last === null) {
      last = nowMs;
      return;
    }
    let frameMs = nowMs - last;
    last = nowMs;
    if (!(frameMs > 0)) frameMs = 0;
    if (frameMs > maxFrameMs) frameMs = maxFrameMs;
    acc += frameMs;
    let n = 0;
    while (acc >= stepMs && n < maxSteps) {
      opts.update(dtSec, step);
      step += 1;
      acc -= stepMs;
      n += 1;
      // update içinde durdurulduysa (oyun bitti / duraklatıldı) kalan adımları işleme.
      if (!running || paused) break;
    }
    if (n === maxSteps && acc >= stepMs) acc = 0; // yetişilemeyen birikimi at (spiral koruması)
  }

  function frame(t: number) {
    rafId = null;
    if (!running || paused) return;
    advance(typeof t === 'number' && Number.isFinite(t) ? t : env.now());
    if (running && !paused) opts.render?.(acc / stepMs);
    schedule();
  }

  const onVisibility = () => {
    if (env.doc?.hidden) loop.pause('hidden');
  };
  const onBlur = () => loop.pause('blur');

  const setPaused = (p: boolean, reason: PauseReason | null) => {
    if (paused === p && pauseReason === reason) return;
    paused = p;
    pauseReason = reason;
    opts.onPauseChange?.(p, reason);
  };

  const loop: FixedStepLoop = {
    start() {
      if (running) return;
      running = true;
      last = null;
      acc = 0;
      if (autoPause) {
        env.doc?.addEventListener('visibilitychange', onVisibility);
        env.win?.addEventListener('blur', onBlur);
      }
      if (autoPause && env.doc?.hidden) {
        setPaused(true, 'hidden');
        return;
      }
      schedule();
    },
    stop() {
      running = false;
      if (rafId !== null) env.caf(rafId);
      rafId = null;
      last = null;
      env.doc?.removeEventListener('visibilitychange', onVisibility);
      env.win?.removeEventListener('blur', onBlur);
    },
    pause(reason = 'user') {
      if (!running || paused) return;
      if (rafId !== null) env.caf(rafId);
      rafId = null;
      setPaused(true, reason);
    },
    resume() {
      if (!running || !paused) return;
      // Duraklamada geçen süre simülasyona eklenmez.
      last = null;
      acc = 0;
      setPaused(false, null);
      schedule();
    },
    get running() {
      return running;
    },
    get paused() {
      return paused;
    },
    get pauseReason() {
      return pauseReason;
    },
    get step() {
      return step;
    },
    get simTimeMs() {
      return step * stepMs;
    },
    tick(nowMs: number) {
      if (!running || paused) return;
      advance(nowMs);
      opts.render?.(acc / stepMs);
    },
  };
  return loop;
}
