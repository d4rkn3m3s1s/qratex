'use client';

/**
 * Sinyal Bağla — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Mantık saf `sim.ts`'te (tohumlu, tamsayı); sunucu aynı tohum + girdi kaydıyla yeniden oynatır.
 * Izgara DOM'da (`role="grid"`, gezici tabindex): dokun/tıkla = saat yönü, sağ tık / Q = ters yön,
 * ok tuşları = gezinme. Ortak süre 60 Hz sabit adımlı döngüde (duraklatınca / sekme gizlenince
 * durur; duraklatmada tahta bulanıklaşır → süre dışı düşünme yok). Juice: 90° dönüş animasyonu,
 * çözümde kaynaktan sunucuya ilerleyen ışık dalgası, ölçülü sarsıntı, ses/titreşim — hepsi `fx`
 * politikasından ve azaltılmış harekette kapalı.
 *
 * Sağlamlık: sıralı modda kayıt sessionStorage'a yazılır (tohum anahtarlı) → yenilemede aynı
 * seviye aynı noktadan devam eder.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Clock, Flag, Lock, Pause, Radio, RotateCcw, RotateCw, Server, Share2, Star, Timer, Trophy } from 'lucide-react';
import { useGameLoop } from '@/lib/games/engine/hooks';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion-pref';
import { sfxClick, sfxCollectStar, sfxFanfare, sfxHit, sfxWarn, sfxWin } from '@/lib/game-sounds';
import {
  CLEAR_BONUS_PER_SEC,
  CODE_BANK,
  CODE_CCW,
  CODE_CW,
  DOWN,
  HZ,
  LEFT,
  LEVELS,
  RIGHT,
  SOLVE_BONUS_TICKS,
  START_TICKS,
  TIME_CAP_TICKS,
  UP,
  computeFlow,
  createPipeSim,
  overallStars,
  tierBase,
  type EndReason,
  type LevelResult,
  type PipeSim,
} from './sim';

const TUTORIAL_KEY = 'qx.signal-pipe.tutorial.v2';
const bestKey = (mode: string) => `qx.signal-pipe.best.${mode}`;
const runKey = (seed: string) => `qx.signal-pipe.run.${seed}`;
const AUTO_SUBMIT_SEC = 15;
const HOLD_MS = 700;
const SPIN_MS = 140;
const FLOW_STEP_MS = 35;

/** Renk körü güvenli: enerjili = camgöbeği + kalın + dolu çekirdek; enerjisiz = gri + ince + boş çekirdek. */
const LIT = '#22d3ee';
const DIM = '#94a3b8';

function readStore(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function writeStore(store: 'local' | 'session', key: string, v: string | null) {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    if (v === null) s.removeItem(key);
    else s.setItem(key, v);
  } catch {
    /* gizli pencere: yalnız kolaylık */
  }
}

interface Restored {
  sim: PipeSim;
  log: InputLog;
  resumed: boolean;
}

/** Kayıttan oyunu birebir yeniden kurar (yalnız sıralıda, aynı tohumla). */
function restore(seed: string, mode: string): Restored {
  const fresh = (): Restored => ({ sim: createPipeSim(seed), log: [], resumed: false });
  if (mode !== 'ranked' || typeof window === 'undefined') return fresh();
  const raw = readStore('session', runKey(seed));
  if (!raw) return fresh();
  try {
    const data = JSON.parse(raw) as { log: InputLog; tick: number };
    if (!Array.isArray(data.log)) return fresh();
    const sim = createPipeSim(seed);
    for (const [at, code, a] of data.log) {
      while (sim.tick < at && !sim.over) sim.step();
      if (sim.over) return fresh();
      if (code === CODE_BANK) {
        if (!sim.bank()) return fresh();
        continue;
      }
      if (typeof a !== 'number' || !sim.rotate(a, code === CODE_CW ? 1 : -1).ok) return fresh();
    }
    const target = Number(data.tick) || 0;
    while (sim.tick < target && !sim.over) sim.step();
    if (sim.tick === 0 && data.log.length === 0) return fresh();
    return { sim, log: data.log, resumed: true };
  } catch {
    return fresh();
  }
}

function readBest(mode: string): number | null {
  const raw = readStore('local', bestKey(mode));
  return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

const SIDE_TEXT: [number, string][] = [
  [UP, 'üst'],
  [RIGHT, 'sağ'],
  [DOWN, 'alt'],
  [LEFT, 'sol'],
];
function shapeName(mask: number): string {
  const k = SIDE_TEXT.filter(([b]) => mask & b).length;
  if (k === 0) return 'boş';
  if (k === 1) return 'uç boru';
  if (k === 2) return mask === (UP | DOWN) || mask === (LEFT | RIGHT) ? 'düz boru' : 'köşe boru';
  if (k === 3) return 'üçlü boru';
  return 'dörtlü boru';
}
function sides(mask: number): string {
  return SIDE_TEXT.filter(([b]) => mask & b)
    .map(([, t]) => t)
    .join(', ');
}

interface Summary {
  score: number;
  reason: EndReason;
  results: LevelResult[];
  clearBonus: number;
  moves: number;
  stars: 0 | 1 | 2 | 3;
  prevBest: number | null;
}

function summarize(sim: PipeSim, threshold: number, prevBest: number | null): Summary {
  return {
    score: sim.score,
    reason: sim.endReason ?? 'time',
    results: sim.results.slice(),
    clearBonus: sim.clearBonus,
    moves: sim.totalMoves,
    stars: overallStars(sim.score, threshold),
    prevBest,
  };
}

export function SignalPipeGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx, accent }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const reduce = useReducedMotionPref();
  const [boot] = useState<Restored>(() => restore(seed, mode));
  const sim = boot.sim;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() =>
    sim.over ? 'summary' : readStore('local', TUTORIAL_KEY) ? 'playing' : 'tutorial'
  );
  const recRef = useRef(
    (() => {
      const r = createInputRecorder();
      for (const [at, code, a] of boot.log) r.record(at, code, a);
      return r;
    })()
  );
  const [, setVer] = useState(0);
  const redraw = useCallback(() => setVer((v) => v + 1), []);
  const [timeLeft, setTimeLeft] = useState(sim.timeLeft);
  const [announce, setAnnounce] = useState(boot.resumed ? 'Kaldığın yerden devam ediyorsun.' : '');
  const [summary, setSummary] = useState<Summary | null>(() => (sim.over ? summarize(sim, threshold, null) : null));
  const [focusCell, setFocusCell] = useState(0);
  const [wave, setWave] = useState<{ key: number; level: number } | null>(null);
  const [spins, setSpins] = useState<Record<number, { k: number; dir: 1 | -1 }>>({});
  const finishedRef = useRef(false);
  const shakeRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const crossedRef = useRef(sim.score >= threshold);
  const levelSeenRef = useRef(sim.levelNo);
  const warnedRef = useRef(-1);

  const playing = stage === 'playing';
  const lv = sim.level;

  const persist = useCallback(() => {
    if (mode !== 'ranked') return;
    writeStore('session', runKey(seed), JSON.stringify({ log: recRef.current.entries(), tick: sim.tick }));
  }, [mode, seed, sim]);

  const shake = useCallback(
    (px: number) => {
      const amp = fx.shake(px);
      const el = shakeRef.current;
      if (!amp || !el || typeof el.animate !== 'function') return;
      el.animate(
        [
          { transform: 'translate(0,0)' },
          { transform: `translate(${amp}px,${-amp / 2}px)` },
          { transform: `translate(${-amp}px,${amp / 2}px)` },
          { transform: 'translate(0,0)' },
        ],
        { duration: 220, easing: 'ease-out' }
      );
    },
    [fx]
  );

  const endRun = useCallback(() => {
    const prevBest = readBest(mode);
    if (prevBest === null || sim.score > prevBest) writeStore('local', bestKey(mode), String(sim.score));
    persist();
    const s = summarize(sim, threshold, prevBest);
    setSummary(s);
    setTimeLeft(sim.timeLeft);
    setStage('summary');
    const why = s.reason === 'clear' ? 'Tüm hatlar bağlandı' : s.reason === 'time' ? 'Süre doldu' : 'Oyunu bitirdin';
    setAnnounce(`${why}. ${s.results.length} seviye, puan ${s.score}.`);
  }, [mode, sim, threshold, persist]);

  const rotate = useCallback(
    (cell: number, dir: 1 | -1) => {
      if (stage !== 'playing' || paused || sim.over) return;
      if (!sim.canRotate(cell)) {
        if (sim.level.locked[cell]) {
          fx.haptic(15);
          setAnnounce('Bu hücre kilitli, döndürülemez.');
          const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`);
          if (el && !reduce && typeof el.animate === 'function') {
            el.animate(
              [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
              { duration: 180, easing: 'ease-in-out' }
            );
          }
        }
        return;
      }
      const r = sim.rotate(cell, dir);
      if (!r.ok) return;
      recRef.current.record(sim.tick, dir === 1 ? CODE_CW : CODE_CCW, cell);
      setSpins((p) => ({ ...p, [cell]: { k: (p[cell]?.k ?? 0) + 1, dir } }));
      persist();
      fx.sfx(() => sfxClick());
      fx.haptic('tap');
      if (r.solved) {
        const s = r.solved;
        setWave({ key: Date.now(), level: s.level });
        fx.sfx(() => sfxCollectStar(s.stars * 2));
        fx.haptic('success');
        shake(3);
        let line = `Hat ${s.level}/${LEVELS} bağlandı! ${s.moves} dokunuş, par ${s.par}, ${s.stars} yıldız, +${s.points} puan.`;
        if (!crossedRef.current && sim.score >= threshold) {
          crossedRef.current = true;
          fx.sfx(() => sfxWin());
          fx.confetti('sides');
          line += ` Ödül eşiği ${threshold} geçildi!`;
        }
        if (r.cleared) {
          fx.sfx(() => sfxFanfare());
          fx.confetti('sides');
          shake(5);
          line += ` Tüm seviyeler bitti! Süre bonusu +${sim.clearBonus}.`;
          setAnnounce(line);
          redraw();
          window.setTimeout(endRun, reduce ? 0 : 700);
          return;
        }
        line += ` Süre +${SOLVE_BONUS_TICKS / HZ} sn.`;
        setAnnounce(line);
      }
      setTimeLeft(sim.timeLeft);
      redraw();
    },
    [stage, paused, sim, fx, persist, shake, threshold, reduce, endRun, redraw]
  );

  useGameLoop({
    active: playing,
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      if (sim.over) return;
      sim.step();
      if (sim.levelNo !== levelSeenRef.current) {
        levelSeenRef.current = sim.levelNo;
        setSpins({});
        setWave(null);
        setFocusCell(sim.level.srcRow * sim.level.n);
        setAnnounce(
          `Seviye ${sim.levelNo}: ${sim.level.n}'e ${sim.level.n} ızgara, par ${sim.level.par}.${
            sim.level.locked.some(Boolean) ? ' Kilitli hücreler var.' : ''
          }`
        );
        redraw();
      }
      if (sim.over) {
        fx.sfx(() => sfxHit());
        fx.haptic('big');
        shake(6);
        endRun();
      }
    },
    render: () => {},
  });

  // HUD süresi ≤ 10 Hz; son 10 saniyede saniyede bir uyarı sesi.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setTimeLeft(sim.timeLeft);
      const sec = Math.ceil(sim.timeLeft / HZ);
      if (!sim.inTransition && !paused && sec <= 10 && sec > 0 && sec !== warnedRef.current) {
        warnedRef.current = sec;
        if (sec <= 5) fx.sfx(() => sfxWarn());
        if (sec === 10) setAnnounce('Son 10 saniye!');
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, paused, sim, fx]);

  useEffect(() => {
    if (!playing || mode !== 'ranked') return;
    const id = window.setInterval(persist, 2000);
    return () => window.clearInterval(id);
  }, [playing, mode, persist]);

  // Esc / P → duraklat (ızgara odakta olmasa da).
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
        e.preventDefault();
        onPauseRequest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, onPauseRequest]);

  // Gezici odak: seviye değişince/oyun başlayınca kaynağa.
  useEffect(() => {
    if (!playing) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${focusCell}"]`);
    if (el && gridRef.current?.contains(document.activeElement)) el.focus();
  }, [focusCell, playing]);
  useEffect(() => {
    if (stage === 'playing') {
      setFocusCell(sim.level.srcRow * sim.level.n);
      requestAnimationFrame(() =>
        gridRef.current?.querySelector<HTMLElement>(`[data-cell="${sim.level.srcRow * sim.level.n}"]`)?.focus()
      );
    }
  }, [stage, sim]);

  const onCellKey = (e: KeyboardEvent<HTMLButtonElement>, cell: number) => {
    const n = lv.n;
    const x = cell % n;
    const y = (cell - x) / n;
    let next = -1;
    if (e.key === 'ArrowUp' && y > 0) next = cell - n;
    else if (e.key === 'ArrowDown' && y < n - 1) next = cell + n;
    else if (e.key === 'ArrowLeft' && x > 0) next = cell - 1;
    else if (e.key === 'ArrowRight' && x < n - 1) next = cell + 1;
    else if (e.key === 'Home') next = y * n;
    else if (e.key === 'End') next = y * n + n - 1;
    else if (e.key === 'q' || e.key === 'Q' || (e.shiftKey && (e.key === 'Enter' || e.key === ' '))) {
      e.preventDefault();
      if (!e.repeat) rotate(cell, -1);
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      setFocusCell(next);
      gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus();
    }
  };

  // "Bitir": basılı tut ve onayla (yanlış dokunuşla günün hakkı yanmasın).
  const [hold, setHold] = useState(0);
  const holdRef = useRef<{ raf: number } | null>(null);
  const cancelHold = useCallback(() => {
    if (holdRef.current) cancelAnimationFrame(holdRef.current.raf);
    holdRef.current = null;
    setHold(0);
  }, []);
  const startHold = () => {
    if (stage !== 'playing' || paused || sim.totalMoves === 0 || holdRef.current) return;
    const start = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        holdRef.current = null;
        setHold(0);
        if (sim.bank()) {
          recRef.current.record(sim.tick, CODE_BANK);
          endRun();
        }
        return;
      }
      holdRef.current = { raf: requestAnimationFrame(tick) };
    };
    holdRef.current = { raf: requestAnimationFrame(tick) };
  };
  useEffect(() => () => cancelHold(), [cancelHold]);

  const submit = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish({
      score: sim.score,
      won: sim.score >= threshold,
      proof: { log: recRef.current.entries() as DeterministicProof['log'], steps: sim.tick },
    });
  }, [onFinish, sim, threshold]);

  const [autoLeft, setAutoLeft] = useState(AUTO_SUBMIT_SEC);
  useEffect(() => {
    if (stage !== 'summary' || mode !== 'ranked' || paused) return;
    const id = window.setInterval(() => {
      setAutoLeft((n) => {
        if (n <= 1) {
          window.clearInterval(id);
          submit();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, mode, paused, submit]);

  const startFromTutorial = () => {
    writeStore('local', TUTORIAL_KEY, '1');
    setStage('playing');
  };

  const fmt = (n: number) => n.toLocaleString('tr-TR');

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    if (!summary) return;
    const squares = Array.from({ length: LEVELS }, (_, i) => {
      const r = summary.results[i];
      return !r ? '⬛' : r.stars === 3 ? '🟩' : r.stars === 2 ? '🟨' : '🟧';
    }).join('');
    const url = `${window.location.origin}/customer/games/signal-pipe`;
    const text = `Qratex Sinyal Bağla: ${summary.results.length}/${LEVELS} hat, ${fmt(summary.score)} puan\n${squares}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Sinyal Bağla', text, url });
        setShareNote('Paylaşıldı.');
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareNote('Panoya kopyalandı.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setShareNote('Paylaşılamadı; tarayıcın bu özelliği desteklemiyor olabilir.');
    }
  };

  const flow = computeFlow(lv); // sim değişken; her çizimde ucuz (≤ 49 hücre)
  const n = lv.n;
  const secLeft = Math.ceil(timeLeft / HZ);
  const timePct = Math.min(1, timeLeft / TIME_CAP_TICKS);
  const low = secLeft <= 10;
  const progress = Math.min(1, sim.score / Math.max(1, threshold));
  const doneLevels = sim.results.length;
  const lastResult = sim.inTransition ? sim.results[sim.results.length - 1] : null;
  const srcCell = lv.srcRow * n;
  const dstCell = lv.dstRow * n + n - 1;
  const portTop = (row: number) => `calc(var(--sp-pad) + (100% - 2 * var(--sp-pad)) * ${(row + 0.5) / n})`;

  return (
    <div className="mx-auto w-full max-w-[440px] select-none">
      <style>{`
        @keyframes sp-cw { from { transform: rotate(-90deg) } to { transform: rotate(0) } }
        @keyframes sp-ccw { from { transform: rotate(90deg) } to { transform: rotate(0) } }
        @keyframes sp-flow { 0% { filter: brightness(1) } 40% { filter: brightness(2.2) drop-shadow(0 0 6px ${LIT}) } 100% { filter: brightness(1) } }
        @keyframes sp-pulse { 0% { box-shadow: 0 0 0 0 ${LIT}aa } 100% { box-shadow: 0 0 0 14px ${LIT}00 } }
        .sp-cw { animation: sp-cw ${SPIN_MS}ms ease-out both }
        .sp-ccw { animation: sp-ccw ${SPIN_MS}ms ease-out both }
        .sp-flow { animation: sp-flow 420ms ease-out both }
        .sp-pulse { animation: sp-pulse 600ms ease-out 2 }
        @media (prefers-reduced-motion: reduce) { .sp-cw, .sp-ccw, .sp-flow, .sp-pulse { animation: none } }
      `}</style>

      {/* HUD: seviye · puan · hamle/par + duraklat. */}
      <div className="mb-2 flex items-stretch gap-2 text-white">
        <dl className="grid flex-1 grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Seviye</dt>
            <dd className="text-lg font-black tabular-nums leading-tight">
              {Math.min(sim.levelNo, LEVELS)}/{LEVELS}
            </dd>
          </div>
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Puan</dt>
            <dd className="text-lg font-black tabular-nums leading-tight">{fmt(sim.score)}</dd>
          </div>
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Hamle / par</dt>
            <dd
              className="text-lg font-black tabular-nums leading-tight"
              style={{ color: sim.moves > lv.par ? '#fbbf24' : undefined }}
            >
              {sim.moves}/{lv.par}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onPauseRequest}
          className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Duraklat"
        >
          <Pause className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Süre çubuğu: renk + ikon + sayı (renk tek ayırt edici değil). */}
      <div className="mb-2 flex items-center gap-2 text-white">
        {low ? <Timer className="h-4 w-4 text-amber-300" aria-hidden /> : <Clock className="h-4 w-4 text-white/70" aria-hidden />}
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Kalan süre"
          aria-valuemin={0}
          aria-valuemax={TIME_CAP_TICKS / HZ}
          aria-valuenow={secLeft}
          aria-valuetext={`${secLeft} saniye`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-100 motion-reduce:transition-none"
            style={{
              width: `${timePct * 100}%`,
              background: low
                ? 'repeating-linear-gradient(45deg,#f59e0b 0 6px,#b45309 6px 12px)'
                : accent,
            }}
          />
        </div>
        <span className={`w-12 text-right text-sm font-bold tabular-nums ${low ? 'text-amber-300' : ''}`}>{secLeft} sn</span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Ödül eşiğine ilerleme"
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Math.min(sim.score, threshold)}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progress * 100}%`, background: progress >= 1 ? '#34d399' : '#a5b4fc' }}
            />
          </div>
          <p className="mt-1 text-xs text-white/75">
            {sim.score >= threshold
              ? 'Ödül eşiği geçildi — devam et, yıldız topla.'
              : `Ödül eşiği ${fmt(threshold)} puan · ${fmt(threshold - sim.score)} kaldı`}
          </p>
        </div>
        {playing && sim.totalMoves > 0 && (
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                e.preventDefault();
                startHold();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === 'Enter' || e.key === ' ') cancelHold();
            }}
            aria-label={
              sim.score >= threshold
                ? 'Oyunu bitir ve sonucu kaydet. Onay için basılı tut.'
                : 'Oyunu bitir. Ödül eşiğine ulaşmadın; onay için basılı tut.'
            }
            className="relative flex h-11 shrink-0 touch-manipulation items-center gap-1.5 overflow-hidden rounded-xl border border-white/20 px-3 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span aria-hidden className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${hold * 100}%` }} />
            <Flag className="relative h-4 w-4" aria-hidden />
            <span className="relative">{hold > 0 ? 'Bırakma…' : 'Bitir (basılı tut)'}</span>
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p id="sp-rules" className="sr-only">
        Sinyal soldaki antenden girer, sağdaki sunucuya ulaşmalı. Ok tuşlarıyla hücreler arasında gez, Enter ya da
        Boşluk saat yönünde, Q ters yönde döndürür. Esc duraklatır. Kaynak satır {lv.srcRow + 1}, sunucu satır{' '}
        {lv.dstRow + 1}.
      </p>

      <div ref={shakeRef}>
        <div
          className="relative aspect-square w-full overflow-hidden rounded-2xl"
          style={
            {
              ['--sp-pad' as string]: '14px',
              background: 'radial-gradient(circle at 50% 30%, #062a33 0%, #04161c 55%, #03080d 90%)',
            } as CSSProperties
          }
        >
          {/* Giriş/çıkış ağızları: ilgili satır hizasında, kenarda. */}
          <span
            aria-hidden
            className="absolute left-0 z-[2] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-r-md bg-cyan-400 text-[#03222a]"
            style={{ top: portTop(lv.srcRow) }}
          >
            <Radio className="h-4 w-4" />
          </span>
          <span
            aria-hidden
            className={`absolute right-0 z-[2] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-l-md ${
              lastResult ? 'bg-emerald-400 text-[#032016]' : 'bg-white/80 text-[#04161c]'
            }`}
            style={{ top: portTop(lv.dstRow) }}
          >
            <span className={`flex h-full w-full items-center justify-center rounded-l-md ${lastResult && !reduce ? 'sp-pulse' : ''}`}>
              <Server className="h-4 w-4" />
            </span>
          </span>

          <div
            ref={gridRef}
            role="grid"
            aria-label={`Sinyal ızgarası, ${n}'e ${n}, seviye ${Math.min(sim.levelNo, LEVELS)}`}
            aria-describedby="sp-rules"
            className="absolute grid transition-[filter] duration-150"
            style={{
              inset: 'var(--sp-pad)',
              gridTemplateColumns: `repeat(${n}, 1fr)`,
              gridTemplateRows: `repeat(${n}, 1fr)`,
              gap: '2px',
              filter: paused ? 'blur(10px)' : undefined,
            }}
            aria-hidden={paused || stage !== 'playing' ? true : undefined}
          >
            {Array.from({ length: n }, (_, y) => (
              <div role="row" key={`${lv.index}-${y}`} className="contents">
                {Array.from({ length: n }, (_, x) => {
                  const cell = y * n + x;
                  const mask = lv.mask[cell];
                  const d = flow.depth[cell];
                  const lit = d >= 0;
                  const locked = lv.locked[cell];
                  const spin = spins[cell];
                  const waving = wave && wave.level === lv.index && lit && !reduce;
                  const label = `Satır ${y + 1}, sütun ${x + 1}: ${shapeName(mask)}${mask ? `, açık uçlar ${sides(mask)}` : ''}${
                    lit ? ', enerjili' : ''
                  }${locked ? ', kilitli' : ''}${cell === srcCell ? ', kaynak' : ''}${cell === dstCell ? ', sunucu' : ''}`;
                  return (
                    <div role="gridcell" key={cell} className="relative min-h-0 min-w-0">
                      <button
                        type="button"
                        data-cell={cell}
                        tabIndex={cell === focusCell ? 0 : -1}
                        aria-label={label}
                        aria-disabled={!mask || locked || undefined}
                        onFocus={() => setFocusCell(cell)}
                        onClick={() => rotate(cell, 1)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          rotate(cell, -1);
                        }}
                        onKeyDown={(e) => onCellKey(e, cell)}
                        className="relative flex h-full w-full touch-manipulation items-center justify-center rounded-md border focus-visible:z-[3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        style={{
                          borderColor: lit ? `${LIT}aa` : locked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)',
                          borderStyle: locked ? 'dashed' : 'solid',
                          background: !mask
                            ? 'transparent'
                            : locked
                              ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0 4px, rgba(255,255,255,0.02) 4px 8px)'
                              : lit
                                ? 'rgba(34,211,238,0.12)'
                                : 'rgba(255,255,255,0.04)',
                          cursor: mask && !locked ? 'pointer' : 'default',
                        }}
                      >
                        <span
                          key={spin ? `s-${spin.k}` : 's'}
                          className={`block h-full w-full ${spin && !reduce ? (spin.dir === 1 ? 'sp-cw' : 'sp-ccw') : ''}`}
                        >
                          <span
                            className={`block h-full w-full ${waving ? 'sp-flow' : ''}`}
                            key={waving ? `w-${wave!.key}` : 'w'}
                            style={waving ? { animationDelay: `${d * FLOW_STEP_MS}ms` } : undefined}
                          >
                            <PipeGlyph mask={mask} lit={lit} />
                          </span>
                        </span>
                        {locked && (
                          <Lock className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-white/70" aria-hidden />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {lastResult && stage === 'playing' && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[4] flex -translate-y-1/2 justify-center" aria-hidden>
              <div className="rounded-2xl bg-[#03080d]/85 px-5 py-3 text-center text-white shadow-xl">
                <p className="text-sm font-bold">Hat {lastResult.level} bağlandı!</p>
                <div className="mt-1 flex justify-center gap-0.5">
                  {[1, 2, 3].map((k) => (
                    <Star
                      key={k}
                      className="h-6 w-6"
                      style={{ color: k <= lastResult.stars ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}
                      fill={k <= lastResult.stars ? '#fbbf24' : 'none'}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-white/80">
                  +{lastResult.points} puan · +{SOLVE_BONUS_TICKS / HZ} sn
                </p>
              </div>
            </div>
          )}

          {stage === 'tutorial' && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sp-tut-title"
              className="absolute inset-0 z-10 flex flex-col justify-center [justify-content:safe_center] gap-3 overflow-y-auto bg-[#03080d]/95 p-5 text-white"
            >
              <h3 id="sp-tut-title" className="text-center text-xl font-bold">
                Nasıl oynanır?
              </h3>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <RotateCw className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
                  <span>
                    <b>Boruya dokun:</b> saat yönünde 90° döner. Sağ tık ya da <b>Q</b> ters yöne çevirir.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Radio className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
                  <span>
                    <b>Sinyal soldaki antenden girer.</b> Kesintisiz hat kurup sağdaki <b>sunucuya</b> ulaştır; enerjili
                    borular parlak ve kalın görünür.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
                  <span>
                    <b>Süre ortak:</b> {START_TICKS / HZ} sn ile başlarsın, her hat +{SOLVE_BONUS_TICKS / HZ} sn. Süre
                    biterse oyun biter. 10 seviye; ızgara büyür, <Lock className="inline h-3.5 w-3.5" aria-hidden />{' '}
                    kilitli hücreler gelir.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Star className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                  <span>
                    <b>Par kadar dokunuşla</b> çöz: 3 yıldız. Seviye puanı = yıldız × {tierBase(1)}–{tierBase(LEVELS)}.
                    Hepsini bitirirsen kalan her saniye +{CLEAR_BONUS_PER_SEC}. Ödül eşiği <b>{fmt(threshold)} puan</b>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                autoFocus
                onClick={startFromTutorial}
                className="mx-auto h-12 rounded-xl px-8 font-bold text-[#03222a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ background: LIT }}
              >
                Anladım, başla
              </button>
            </div>
          )}

          {stage === 'summary' && summary && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sp-sum-title"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center [justify-content:safe_center] gap-2.5 overflow-y-auto bg-[#03080d]/95 p-5 text-center text-white"
            >
              <h3 id="sp-sum-title" className="text-xl font-bold">
                {summary.reason === 'clear' ? 'Tüm hatlar bağlandı!' : summary.reason === 'time' ? 'Süre doldu' : 'Oyunu bitirdin'}
              </h3>
              <div className="flex gap-1" role="img" aria-label={`3 yıldızdan ${summary.stars}`}>
                {[1, 2, 3].map((k) => (
                  <Star
                    key={k}
                    className="h-9 w-9"
                    aria-hidden
                    style={{ color: k <= summary.stars ? '#fbbf24' : 'rgba(255,255,255,0.25)' }}
                    fill={k <= summary.stars ? '#fbbf24' : 'none'}
                  />
                ))}
              </div>
              <p className="text-4xl font-black tabular-nums">{fmt(summary.score)}</p>
              <p className="text-xs text-white/75">
                {summary.prevBest === null
                  ? 'İlk puanın bu cihazda kaydedildi.'
                  : summary.score > summary.prevBest
                    ? `Yeni kişisel rekor! (önceki ${fmt(summary.prevBest)})`
                    : `En iyin: ${fmt(summary.prevBest)}`}
                {mode === 'practice' ? ' · Pratik' : ''}
              </p>
              <ol className="grid grid-cols-5 gap-1.5" aria-label="Seviye yıldızları">
                {Array.from({ length: LEVELS }, (_, i) => {
                  const r = summary.results[i];
                  return (
                    <li
                      key={i}
                      className="flex h-11 w-11 flex-col items-center justify-center rounded-lg text-[10px] font-bold"
                      style={{ background: r ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.06)' }}
                      aria-label={r ? `Seviye ${i + 1}: ${r.stars} yıldız, ${r.moves} dokunuş, par ${r.par}` : `Seviye ${i + 1}: çözülmedi`}
                    >
                      <span className="text-white/70">{i + 1}</span>
                      <span aria-hidden className="tracking-tighter text-amber-300">
                        {r ? '★'.repeat(r.stars) : '–'}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <dl className="grid w-full max-w-xs grid-cols-3 gap-2 text-xs">
                {[
                  ['Hat', `${summary.results.length}/${LEVELS}`],
                  ['Dokunuş', String(summary.moves)],
                  ['Süre bonusu', summary.clearBonus ? `+${summary.clearBonus}` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-white/10 px-2 py-1.5">
                    <dt className="text-white/70">{k}</dt>
                    <dd className="font-bold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-white/75">
                {summary.score >= threshold
                  ? mode === 'ranked'
                    ? 'Ödül eşiğini geçtin — sunucu dokunuşlarını yeniden oynatıp doğruladıktan sonra ödül hesaplanır.'
                    : 'Eşiği geçtin. Sıralı modda bu puan ödül getirirdi.'
                  : `Ödül eşiği ${fmt(threshold)} puan; ${fmt(threshold - summary.score)} puan kaldı.`}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={share}
                  className="flex h-11 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Share2 className="h-4 w-4" aria-hidden /> Paylaş
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={submit}
                  className="flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#03222a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  style={{ background: LIT }}
                >
                  {mode === 'ranked' ? <Trophy className="h-4 w-4" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                  {mode === 'ranked' ? `Sonucu kaydet (${autoLeft})` : 'Devam'}
                </button>
              </div>
              <p className="min-h-[1rem] text-xs text-white/75" aria-live="polite">
                {shareNote}
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-white/70">
        {boot.resumed && stage === 'playing' ? 'Kaldığın yerden devam ediyorsun. · ' : ''}
        {doneLevels > 0 ? `${doneLevels} hat bağlandı · ` : ''}
        {mode === 'practice' ? 'Pratik: ödülsüz, liderliğe girmez.' : 'Sıralı: dokunuşların sunucuda yeniden oynatılarak doğrulanır.'}
      </p>
    </div>
  );
}

/** Hücredeki boru: merkezden açık kenarlara. Enerjili: kalın + parlak + dolu çekirdek. */
function PipeGlyph({ mask, lit }: { mask: number; lit: boolean }) {
  if (!mask) return null;
  const color = lit ? LIT : DIM;
  const w = lit ? 22 : 14;
  const segs: [number, number][] = [];
  if (mask & UP) segs.push([50, 0]);
  if (mask & RIGHT) segs.push([100, 50]);
  if (mask & DOWN) segs.push([50, 100]);
  if (mask & LEFT) segs.push([0, 50]);
  const ends = segs.length;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden style={{ filter: lit ? `drop-shadow(0 0 3px ${LIT})` : undefined }}>
      {segs.map(([x2, y2], i) => (
        <line key={i} x1={50} y1={50} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap={ends === 1 ? 'round' : 'butt'} />
      ))}
      <circle cx={50} cy={50} r={ends === 1 ? 16 : w / 2} fill={lit ? '#ecfeff' : '#0b1b22'} stroke={color} strokeWidth={lit ? 4 : 5} />
    </svg>
  );
}
