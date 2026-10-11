'use client';

/**
 * Yorum İstifi — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Döngü: motorun 60 Hz sabit adımı → `sim.step()` (saf, tohumlu). React state'e karede YAZILMAZ:
 * HUD 10 Hz'de ref'ten okunur. Yalnız simülasyonun kabul ettiği girdi `sim.tick` ile kaydedilir →
 * sunucu aynı tohumla birebir yeniden oynatır. Dokunmatik kontroller `useCoarsePointer` ile (≥640 px
 * iPad dahil) gösterilir; basılı tutunca tekrar eder (motorun sanal tuş tekrarı).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  Layers,
  Pause,
  RotateCcw,
  RotateCw,
  Share2,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';
import { useCanvasSurface, useCoarsePointer, useGameInput, useGameLoop, useLatestRef } from '@/lib/games/engine/hooks';
import { useGamesCopy } from '../copy';
import { useReviewStackCopy } from './copy';
import { createInputRecorder } from '@/lib/games/engine/record';
import type { GameAction } from '@/lib/games/engine/input';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { sfxClick, sfxCombo, sfxFanfare, sfxHit, sfxPowerUp, sfxWin } from '@/lib/game-sounds';
import {
  CODE,
  END_TEXT,
  LINES_PER_LEVEL,
  MAX_LEVEL,
  SHAPES,
  createStackSim,
  starsFor,
  type EndCause,
  type PieceKind,
  type SimEvent,
  type StackSim,
} from './sim';
import { CELL, KIND_COLOR, KIND_NAME, PALETTE, RS_H, RS_W, applyEventsToFx, createFxState, drawFrame } from './render';

const TUTORIAL_KEY = 'qx.review-stack.tutorial.v1';
const bestKey = (mode: string) => `qx.review-stack.best.${mode}`;
/** Sıralı modda özet ekranı bu kadar sn sonra sonucu kendiliğinden gönderir (deneme kaybolmasın). */
const AUTO_SUBMIT_SEC = 12;

/** `KeyboardEvent.code` → Caps Lock / klavye düzeninden bağımsız. */
const KEYMAP: Readonly<Record<string, GameAction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowUp: 'up',
  KeyW: 'up',
  KeyX: 'up',
  Space: 'primary',
  KeyC: 'secondary',
  ShiftLeft: 'secondary',
  ShiftRight: 'secondary',
  Escape: 'pause',
  KeyP: 'pause',
};
const ACTION_CODE_MAP: Partial<Record<GameAction, number>> = {
  left: CODE.LEFT,
  right: CODE.RIGHT,
  down: CODE.SOFT,
  up: CODE.ROTATE_CW,
  primary: CODE.HARD,
  secondary: CODE.HOLD,
};
/** Basılı tutunca tekrar eden eylemler (döndürme/sert düşürme/sakla tekrarlamaz). */
const REPEATABLE = new Set<GameAction>(['left', 'right', 'down']);

function readLs(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLs(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* gizli pencere: yalnız kolaylık */
  }
}

interface Hud {
  score: number;
  lines: number;
  level: number;
  hold: PieceKind | null;
  canHold: boolean;
  next: PieceKind[];
}
const snapshot = (sim: StackSim): Hud => ({
  score: sim.score,
  lines: sim.lines,
  level: sim.level,
  hold: sim.hold,
  canHold: sim.canHold,
  next: sim.queue(3),
});

interface Summary {
  score: number;
  lines: number;
  level: number;
  pieces: number;
  tetrises: number;
  cause: EndCause | null;
  stars: 0 | 1 | 2 | 3;
  prevBest: number | null;
}

/** Küçük parça önizlemesi (DOM; şekil ayırt edici, renk yardımcı). */
function MiniPiece({ kind, dim = false, size = 12 }: { kind: PieceKind | null; dim?: boolean; size?: number }) {
  if (!kind) return <div style={{ width: size * 4, height: size * 2 }} aria-hidden />;
  const cells = SHAPES[kind][0];
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const w = Math.max(...cells.map((c) => c[0])) - minX + 1;
  const h = Math.max(...cells.map((c) => c[1])) - minY + 1;
  return (
    <div className="relative mx-auto" style={{ width: w * size, height: h * size, opacity: dim ? 0.4 : 1 }} aria-hidden>
      {cells.map(([x, y], i) => (
        <span
          key={i}
          className="absolute rounded-[2px]"
          style={{
            left: (x - minX) * size + 1,
            top: (y - minY) * size + 1,
            width: size - 2,
            height: size - 2,
            background: KIND_COLOR[kind],
          }}
        />
      ))}
    </div>
  );
}

export function ReviewStackGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const maxScore = config.maxScore;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() =>
    readLs(TUTORIAL_KEY) ? 'playing' : 'tutorial'
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = useReviewStackCopy();
  const c = useGamesCopy().common;
  const tRef = useLatestRef(t);
  const cRef = useLatestRef(c);
  const boardRef = useRef<HTMLDivElement>(null);
  const surface = useCanvasSurface(canvasRef, { width: RS_W, height: RS_H });
  const [simObj] = useState<StackSim>(() => createStackSim(seed, { events: true, threshold, maxScore }));
  const recRef = useRef(createInputRecorder());
  const fxRef = useRef(createFxState());
  const finishedRef = useRef(false);
  const endedRef = useRef(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(simObj));
  const [announce, setAnnounce] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const coarse = useCoarsePointer();

  const playing = stage === 'playing';
  const rich = fx.canCelebrate();

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      if (events.length === 0) return;
      applyEventsToFx(fxRef.current, events, rich, (px) => fx.shake(px), tRef.current.clearLabels);
      for (const e of events) {
        switch (e.t) {
          case 'count':
            fx.sfx(() => sfxClick());
            setAnnounce(String(e.n));
            break;
          case 'go':
            fx.sfx(() => sfxPowerUp());
            setAnnounce(cRef.current.start);
            break;
          case 'lock':
            if (e.hard) fx.haptic('tap');
            break;
          case 'clear':
            fx.sfx(() => sfxCombo(e.n - 1));
            fx.haptic(e.n >= 4 ? 'big' : 'success');
            if (e.n >= 4) fx.confetti('sides');
            setAnnounce(tRef.current.cleared(e.n, e.gained, e.score));
            break;
          case 'level':
            fx.sfx(() => sfxFanfare());
            setAnnounce(tRef.current.levelAnnounce(e.level));
            break;
          case 'threshold':
            fx.sfx(() => sfxWin());
            fx.haptic('success');
            setAnnounce(tRef.current.thresholdAnnounce(threshold));
            break;
          case 'over':
            if (e.cause === 'topout') {
              fx.sfx(() => sfxHit());
              fx.haptic('big');
            } else {
              fx.sfx(() => sfxFanfare());
              fx.confetti('sides');
            }
            break;
          default:
            break;
        }
      }
    },
    [fx, rich, threshold]
  );

  const endRun = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const sim = simObj;
    let prevBest: number | null = null;
    const raw = readLs(bestKey(mode));
    if (raw !== null && Number.isFinite(Number(raw))) prevBest = Number(raw);
    if (prevBest === null || sim.score > prevBest) writeLs(bestKey(mode), String(sim.score));
    const s: Summary = {
      score: sim.score,
      lines: sim.lines,
      level: sim.level,
      pieces: sim.pieces,
      tetrises: sim.tetrises,
      cause: sim.cause,
      stars: starsFor(sim.score, threshold, maxScore),
      prevBest,
    };
    setSummary(s);
    setHud(snapshot(sim));
    setStage('summary');
    setAnnounce(tRef.current.endAnnounce(s.cause ? tRef.current.end[s.cause] : cRef.current.gameOver, s.score, s.stars));
  }, [mode, threshold, maxScore, simObj]);

  useGameLoop({
    active: playing,
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      const sim = simObj;
      if (sim.over) return;
      sim.step();
      handleEvents(sim.drainEvents());
      if (sim.over) endRun();
    },
    render: () => {
      const s = surface.current;
      if (!s) return;
      drawFrame(s.beginFrame(), simObj, fxRef.current, { rich, now: performance.now() });
    },
  });

  // HUD ≤ 10 Hz.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHud(snapshot(simObj)), 100);
    return () => window.clearInterval(id);
  }, [playing, simObj]);

  /** Girdiyi simülasyona ver; kabul edilirse sim.tick ile kaydet (sunucu replay'i birebir). */
  const act = useCallback(
    (code: number) => {
      if (stage !== 'playing' || paused) return false;
      const sim = simObj;
      const ok = sim.input(code);
      if (ok) {
        recRef.current.record(sim.tick, code);
        handleEvents(sim.drainEvents());
        if (code === CODE.HOLD) setHud(snapshot(sim));
        if (sim.over) endRun();
      }
      return ok;
    },
    [stage, paused, simObj, handleEvents, endRun]
  );

  // Dokunma jesti: yatay sürükleme hücre hücre kaydırır, yavaş aşağı sürükleme yumuşak düşürür,
  // hızlı aşağı fırlatma sert düşürür, kısa dokunuş döndürür.
  const gesture = useRef<{ id: number; x0: number; y0: number; lx: number; ly: number; t0: number; moved: boolean } | null>(
    null
  );

  const inputRef = useGameInput(boardRef, {
    active: playing,
    keymap: KEYMAP,
    swipe: false,
    pointer: true,
    repeatDelayMs: 170,
    repeatIntervalMs: 50,
    toLogical: (x, y) => surface.current?.toLogical(x, y) ?? { x, y },
    onInput: (e) => {
      if (e.type === 'pointer') {
        const g = gesture.current;
        if (e.phase === 'down') {
          gesture.current = { id: e.pointerId, x0: e.x, y0: e.y, lx: e.x, ly: e.y, t0: performance.now(), moved: false };
          return;
        }
        if (!g || g.id !== e.pointerId) return;
        if (e.phase === 'move') {
          while (e.x - g.lx >= CELL) {
            act(CODE.RIGHT);
            g.lx += CELL;
            g.moved = true;
          }
          while (g.lx - e.x >= CELL) {
            act(CODE.LEFT);
            g.lx -= CELL;
            g.moved = true;
          }
          while (e.y - g.ly >= CELL) {
            act(CODE.SOFT);
            g.ly += CELL;
            g.moved = true;
          }
          return;
        }
        if (e.phase === 'up') {
          const dt = Math.max(1, performance.now() - g.t0);
          const dy = e.y - g.y0;
          const dx = Math.abs(e.x - g.x0);
          if (dy > CELL * 2 && dy / dt > 0.6 && dx < CELL * 1.5) act(CODE.HARD);
          else if (!g.moved && dt < 300 && dx < CELL * 0.6 && Math.abs(dy) < CELL * 0.6) {
            // Dokunulan yarıya göre: sağ yarı saat yönü, sol yarı ters.
            act(e.x >= RS_W / 2 ? CODE.ROTATE_CW : CODE.ROTATE_CCW);
          }
        }
        gesture.current = null;
        return;
      }
      if (e.type !== 'press') return;
      if (e.action === 'pause') {
        if (!e.repeat) onPauseRequest();
        return;
      }
      if (e.repeat && !REPEATABLE.has(e.action)) return;
      const code = ACTION_CODE_MAP[e.action];
      if (code) act(code);
    },
  });

  // Ters döndürme (Z) — motorun eylem kümesinde yok; ayrı dinleyici.
  useEffect(() => {
    if (!playing) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== 'KeyZ' || ev.repeat) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      ev.preventDefault();
      act(CODE.ROTATE_CCW);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, act]);

  // Duraklatınca basılı tuşları bırak (tekrar zamanlayıcısı kaçmasın).
  useEffect(() => {
    if (paused) inputRef.current?.releaseAll();
  }, [paused, inputRef]);

  const submit = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const sim = simObj;
    onFinish({
      score: sim.score,
      won: sim.score >= threshold,
      proof: { log: recRef.current.entries() as DeterministicProof['log'], steps: sim.tick },
    });
  }, [onFinish, threshold, simObj]);

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
    writeLs(TUTORIAL_KEY, '1');
    setStage('playing');
  };

  useEffect(() => {
    if (stage === 'playing') boardRef.current?.focus();
  }, [stage]);

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    if (!summary) return;
    const url = `${window.location.origin}/customer/games/review-stack`;
    const text = t.share(summary.lines, summary.score, summary.stars);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: t.shareTitle, text, url });
        setShareNote(c.shared);
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareNote(c.copied);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setShareNote(c.shareFailed);
    }
  };

  const progress = Math.min(1, hud.score / Math.max(1, threshold));
  const hudSummary = useMemo(
    () =>
      t.hudSummary(
        hud.score,
        threshold,
        maxScore,
        hud.lines,
        hud.level,
        hud.next.map((k) => t.kind[k] ?? KIND_NAME[k]).join(', '),
        hud.hold ? t.kind[hud.hold] ?? KIND_NAME[hud.hold] : null
      ),
    [hud, threshold, maxScore, t]
  );

  /** Dokunmatik tuş: basılı tutma tekrarı motordan (yalnız kaydırma/yumuşak düşürme). */
  const padButton = (label: string, Icon: typeof ArrowLeft, opts: { action?: GameAction; code?: number; wide?: boolean }) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        if (opts.action && REPEATABLE.has(opts.action)) inputRef.current?.press(opts.action);
        else if (opts.code !== undefined) act(opts.code);
      }}
      onPointerUp={() => opts.action && inputRef.current?.release(opts.action)}
      onPointerLeave={() => opts.action && inputRef.current?.release(opts.action)}
      onPointerCancel={() => opts.action && inputRef.current?.release(opts.action)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          const code = opts.code ?? (opts.action ? ACTION_CODE_MAP[opts.action] : undefined);
          if (code !== undefined) act(code);
        }
      }}
      className={`flex h-14 touch-manipulation items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white active:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
        opts.wide ? 'col-span-2' : ''
      }`}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[520px] select-none">
      {/* HUD şeridi */}
      <div className="mb-2 flex items-center gap-2 text-white" aria-hidden={stage !== 'playing'}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs text-white/75">
            <span>
              {t.level} <b className="tabular-nums text-white">{hud.level}</b>/{MAX_LEVEL}
              <span className="text-white/65">{t.lines(hud.lines)}</span>
            </span>
            <span>
              {t.score} <b className="tabular-nums text-white">{hud.score}</b>
              <span className="text-white/65">{c.thresholdSuffix(threshold)}</span>
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label={c.progress}
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Math.min(hud.score, threshold)}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progress * 100}%`, background: progress >= 1 ? PALETTE.gold : PALETTE.accent }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onPauseRequest}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={c.pause}
        >
          <Pause className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p id="rs-rules" className="sr-only">
        {hudSummary} {t.rules}
      </p>

      <div className="flex items-start justify-center gap-2">
        <div
          ref={boardRef}
          tabIndex={0}
          role="application"
          aria-label={t.arena}
          aria-describedby="rs-rules"
          className="relative w-full touch-none overflow-hidden rounded-2xl border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{ background: PALETTE.bg, aspectRatio: `${RS_W} / ${RS_H}`, maxWidth: 'min(100%, calc(62vh * 10 / 18))' }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

          {stage === 'tutorial' && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="rs-tut-title"
              className="absolute inset-0 flex flex-col justify-center [justify-content:safe_center] gap-3 overflow-y-auto bg-[#0b1020]/95 p-4 text-white"
            >
              <h3 id="rs-tut-title" className="text-center text-lg font-bold">
                {c.howTo}
              </h3>
              <ol className="space-y-2.5 text-sm">
                <li className="flex gap-2.5">
                  <Layers className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.accent }} aria-hidden />
                  <span>
                    <b>{t.stackTitle}</b>
                    {t.stackBody}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Zap className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.gold }} aria-hidden />
                  <span>
                    <b>{t.levelTitle(LINES_PER_LEVEL)}</b>
                    {t.levelBody}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Archive className="mt-0.5 h-5 w-5 shrink-0" style={{ color: KIND_COLOR.T }} aria-hidden />
                  <span>
                    <b>{t.holdTitle}</b>
                    {t.holdBody}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Trophy className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.gold }} aria-hidden />
                  <span>
                    <b>{t.thresholdTitle(threshold)}</b>
                    {t.thresholdBody(maxScore)}
                  </span>
                </li>
              </ol>
              <p className="text-center text-xs text-white/70">
                {coarse
                  ? t.touchKeys
                  : t.keys}
              </p>
              <button
                type="button"
                autoFocus
                onClick={startFromTutorial}
                className="mx-auto h-12 rounded-xl px-8 font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ background: PALETTE.accent }}
              >
                {c.gotIt}
              </button>
            </div>
          )}

          {stage === 'summary' && summary && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="rs-sum-title"
              className="absolute inset-0 flex flex-col items-center justify-center [justify-content:safe_center] gap-2 overflow-y-auto bg-[#0b1020]/95 p-4 text-center text-white"
            >
              <h3 id="rs-sum-title" className="text-lg font-bold">
                {summary.cause ? t.end[summary.cause] : c.gameOver}
              </h3>
              <div className="flex gap-1" role="img" aria-label={c.stars(summary.stars)}>
                {[1, 2, 3].map((n) => (
                  <Star
                    key={n}
                    className="h-8 w-8"
                    aria-hidden
                    style={{ color: n <= summary.stars ? PALETTE.gold : 'rgba(255,255,255,0.25)' }}
                    fill={n <= summary.stars ? PALETTE.gold : 'none'}
                  />
                ))}
              </div>
              <p className="text-4xl font-black tabular-nums">{summary.score}</p>
              <p className="text-xs text-white/75">
                {summary.prevBest === null
                  ? c.firstScore
                  : summary.score > summary.prevBest
                    ? c.newBest(summary.prevBest)
                    : c.best(summary.prevBest)}
                {mode === 'practice' ? c.practiceSuffix : ''}
              </p>
              <dl className="grid w-full max-w-[15rem] grid-cols-2 gap-1.5 text-xs">
                {[
                  [t.statLines, String(summary.lines)],
                  [t.statLevel, `${summary.level}/${MAX_LEVEL}`],
                  [t.statPieces, String(summary.pieces)],
                  [t.statTetris, String(summary.tetrises)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-white/5 px-2 py-1">
                    <dt className="text-white/65">{k}</dt>
                    <dd className="font-bold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-white/75">
                {summary.score >= threshold
                  ? mode === 'ranked'
                    ? t.passedRanked
                    : c.passedPractice
                  : t.remaining(threshold, threshold - summary.score)}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={share}
                  className="flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Share2 className="h-4 w-4" aria-hidden /> {c.share}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={submit}
                  className="flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  style={{ background: PALETTE.accent }}
                >
                  <Trophy className="h-4 w-4" aria-hidden />
                  {mode === 'ranked' ? c.save(autoLeft) : c.cont}
                </button>
              </div>
              <p className="min-h-[1rem] text-xs text-white/75" aria-live="polite">
                {shareNote}
              </p>
            </div>
          )}
        </div>

        {/* Yan panel: sakla + sıradaki */}
        <aside className="flex w-[4.5rem] shrink-0 flex-col gap-2 text-center text-white" aria-hidden>
          <div className="rounded-xl border border-white/10 bg-white/5 p-1.5">
            <p className="mb-1 text-[11px] font-semibold text-white/75">{t.hold}</p>
            <div className="flex h-8 items-center justify-center">
              <MiniPiece kind={hud.hold} dim={!hud.canHold} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-1.5">
            <p className="mb-1 text-[11px] font-semibold text-white/75">{t.next}</p>
            <div className="flex flex-col items-center gap-2">
              {hud.next.map((k, i) => (
                <div key={i} className="flex h-7 items-center justify-center">
                  <MiniPiece kind={k} size={i === 0 ? 12 : 9} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Dokunmatik tuşlar: ekran genişliğiyle değil işaretçi türüyle (iPad dahil). */}
      {coarse && stage === 'playing' && (
        <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label={t.pad}>
          {padButton(t.hold, Archive, { code: CODE.HOLD })}
          {padButton(t.rotateCcw, RotateCcw, { code: CODE.ROTATE_CCW })}
          {padButton(t.rotate, RotateCw, { code: CODE.ROTATE_CW })}
          {padButton(t.hardDrop, ChevronsDown, { code: CODE.HARD })}
          {padButton(t.moveLeft, ArrowLeft, { action: 'left' })}
          {padButton(t.softDrop, ArrowDown, { action: 'down', wide: true })}
          {padButton(t.moveRight, ArrowRight, { action: 'right' })}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-white/70">
        {mode === 'practice' ? c.footPractice : c.footRanked}
      </p>
    </div>
  );
}
