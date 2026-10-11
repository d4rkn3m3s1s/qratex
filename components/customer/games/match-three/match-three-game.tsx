'use client';

/**
 * Eşleştir-3 — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Mantık saf `sim.ts`'te (tohumlu); sunucu aynı tohum + hamle kaydıyla yeniden oynatır. Tahta DOM'da
 * çizilir: taşlar `transform` ile konumlanır (layout değil), temizlenen taş söner, yeni taş yukarıdan
 * düşer. Sim hamleyi anında çözer; animasyon yalnız sunumdur (aşama aşama oynatılır). Azaltılmış
 * harekette tüm süreler 0 ve efektler kapalı (fx politikası).
 *
 * Akış: Sıralı → (ilk kez öğretici) → günlük rota (5 seviye) → seviyeler → sonuç. Pratik → (öğretici)
 * → seviye haritası (30 seviye; bu cihazdaki ilerleme) → tek seviye → sonuç.
 * Sağlamlık: sıralı modda kayıt sessionStorage'a yazılır (tohum anahtarlı) → yenilemede aynı tahta.
 * Oturum süresi (config.maxDurationSec) dolmadan koşu kendiliğinden bitirilir; sonuç kaybolmaz.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import {
  Bomb,
  Flag,
  Heart,
  Lock,
  Map as MapIcon,
  MessageSquare,
  MoveHorizontal,
  MoveVertical,
  Pause,
  QrCode,
  RotateCcw,
  Share2,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useGameLoop, useLatestRef } from '@/lib/games/engine/hooks';
import { useGamesCopy } from '../copy';
import { useMatchThreeCopy } from './copy';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion-pref';
import { sfxBoom, sfxClick, sfxCombo, sfxFanfare, sfxHit, sfxPowerUp, sfxWin } from '@/lib/game-sounds';
import {
  BADGES,
  COLS,
  LEVELS,
  LEVEL_COUNT,
  MAX_RUN_SCORE,
  ROWS,
  type LevelDef,
} from './levels';
import {
  CODE_END,
  CODE_SWAP,
  SP_BOMB,
  SP_LINE_H,
  SP_LINE_V,
  SP_NONE,
  SP_PRISM,
  adjacent,
  colOf,
  createMatchSim,
  rankedLevels,
  rowOf,
  runStars,
  type LevelOutcome,
  type MatchSim,
  type Special,
  type SwapResult,
  type TileView,
} from './sim';

const TUTORIAL_KEY = 'qx.match-three.tutorial.v1';
const PROGRESS_KEY = 'qx.match-three.progress.v1';
const bestKey = (mode: string) => `qx.match-three.best.${mode}`;
const runKey = (seed: string) => `qx.match-three.run.${seed}`;
const AUTO_SUBMIT_SEC = 15;
const HOLD_MS = 700;
const HINT_AFTER_MS = 7000;
/** Oturum bitmeden bu kadar sn önce koşu kendiliğinden bitirilir (gönderim payı). */
const SESSION_SAFETY_SEC = 45;

const T = { swap: 130, pop: 190, fall: 230, shuffle: 320 };

const BADGE_ICON: LucideIcon[] = [Star, Heart, Shield, MessageSquare, QrCode, Trophy];

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

/** Bu cihazdaki pratik ilerlemesi: seviye → en iyi yıldız. */
function readProgress(): Record<number, number> {
  const raw = typeof window === 'undefined' ? null : readStore('local', PROGRESS_KEY);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(o)) {
      const n = Number(k);
      if (Number.isInteger(n) && typeof v === 'number') out[n] = Math.max(0, Math.min(3, v));
    }
    return out;
  } catch {
    return {};
  }
}
const unlockedUpTo = (p: Record<number, number>) => {
  let n = 1;
  while (n < LEVEL_COUNT && (p[n] ?? 0) > 0) n++;
  return n;
};

function readBest(mode: string): number | null {
  const raw = readStore('local', bestKey(mode));
  return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

type Stage = 'tutorial' | 'map' | 'route' | 'playing' | 'levelEnd' | 'summary';

interface ViewTile extends TileView {
  popping?: boolean;
  nudge?: { dx: number; dy: number };
}

interface Spark {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}
interface Beam {
  id: number;
  sp: Special;
  cell: number;
}

interface Boot {
  sim: MatchSim | null;
  log: InputLog;
  resumed: boolean;
}

/** Sıralı koşuyu kayıttan birebir yeniden kurar (yalnız aynı tohumla). */
function restoreRanked(seed: string): Boot {
  const fresh = (): Boot => ({ sim: createMatchSim(seed, rankedLevels(seed)), log: [], resumed: false });
  if (typeof window === 'undefined') return fresh();
  const raw = readStore('session', runKey(seed));
  if (!raw) return fresh();
  try {
    const data = JSON.parse(raw) as { log: InputLog; tick: number };
    if (!Array.isArray(data.log) || data.log.length === 0) return fresh();
    const sim = createMatchSim(seed, rankedLevels(seed));
    for (const [at, code, a, b] of data.log) {
      sim.setTick(at);
      if (code === CODE_END) {
        if (!sim.end()) return fresh();
        continue;
      }
      if (code !== CODE_SWAP || a === undefined || b === undefined || !sim.swap(a, b).ok) return fresh();
    }
    if (!sim.over) sim.setTick(Number(data.tick) || 0);
    return { sim, log: data.log, resumed: true };
  } catch {
    return fresh();
  }
}

function BadgeGlyph({ kind, sp, size = '58%' }: { kind: number; sp: Special; size?: string }) {
  if (sp === SP_PRISM) {
    return (
      <span
        className="flex h-full w-full items-center justify-center rounded-[22%] text-white"
        style={{ background: 'conic-gradient(from 0deg, #E69F00, #D55E00, #CC79A7, #0072B2, #56B4E9, #009E73, #E69F00)' }}
      >
        <Sparkles style={{ width: size, height: size }} strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  const b = BADGES[kind] ?? BADGES[0];
  const Icon = BADGE_ICON[kind] ?? Star;
  return (
    <span
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[22%] text-[#111]"
      style={{
        background: `radial-gradient(circle at 35% 30%, #ffffffaa 0%, ${b.color} 55%, ${b.color} 100%)`,
        boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.22)',
      }}
    >
      {(sp === SP_LINE_H || sp === SP_LINE_V) && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `repeating-linear-gradient(${sp === SP_LINE_H ? '0deg' : '90deg'}, transparent 0 18%, rgba(255,255,255,0.55) 18% 30%)`,
          }}
        />
      )}
      {sp === SP_BOMB && <span aria-hidden className="absolute inset-[8%] rounded-full border-[3px] border-white/90" />}
      <Icon className="relative" style={{ width: size, height: size }} strokeWidth={2.4} fill="rgba(255,255,255,0.35)" aria-hidden />
      {sp === SP_LINE_H && <MoveHorizontal className="absolute bottom-[4%] right-[4%] h-[34%] w-[34%] text-white drop-shadow" aria-hidden />}
      {sp === SP_LINE_V && <MoveVertical className="absolute bottom-[4%] right-[4%] h-[34%] w-[34%] text-white drop-shadow" aria-hidden />}
      {sp === SP_BOMB && <Bomb className="absolute bottom-[4%] right-[4%] h-[34%] w-[34%] text-white drop-shadow" aria-hidden />}
    </span>
  );
}

function GoalChip({ level, done, total }: { level: LevelDef; done: number; total: number }) {
  const t = useMatchThreeCopy();
  const g = level.goal;
  return (
    <span className="flex items-center gap-1.5">
      {g.type === 'collect' ? (
        <span className="inline-block h-5 w-5">
          <BadgeGlyph kind={g.kind} sp={SP_NONE} size="70%" />
        </span>
      ) : g.type === 'glass' ? (
        <span className="inline-block h-5 w-5 rounded border-2 border-sky-200 bg-sky-200/40" aria-hidden />
      ) : (
        <Target className="h-5 w-5 text-amber-300" aria-hidden />
      )}
      <span className="tabular-nums">
        {done.toLocaleString(t.numberLocale)}/{total.toLocaleString(t.numberLocale)}
      </span>
    </span>
  );
}

function Stars({ n, size = 'h-8 w-8', label }: { n: number; size?: string; label?: string }) {
  const t = useMatchThreeCopy();
  return (
    <span className="flex gap-1" role="img" aria-label={label ?? t.stars(n)}>
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          className={size}
          aria-hidden
          style={{ color: i <= n ? '#F5C542' : 'rgba(255,255,255,0.25)' }}
          fill={i <= n ? '#F5C542' : 'none'}
        />
      ))}
    </span>
  );
}

function Overlay({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center [justify-content:safe_center] gap-3 overflow-y-auto bg-[#140f24]/95 p-5 text-center text-white"
    >
      {children}
    </div>
  );
}

const btnPrimary =
  'flex h-12 min-w-[44px] items-center justify-center gap-2 rounded-xl px-6 font-bold text-[#140f24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
const btnGhost =
  'flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';

export function MatchThreeGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx, accent }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const maxScore = config.maxScore || MAX_RUN_SCORE;
  const reduce = useReducedMotionPref();
  const t = useMatchThreeCopy();
  const c = useGamesCopy().common;
  const tRef = useLatestRef(t);
  const goalText = t.goal;
  const ranked = mode === 'ranked';

  const [boot] = useState<Boot>(() => (ranked ? restoreRanked(seed) : { sim: null, log: [], resumed: false }));
  const simRef = useRef<MatchSim | null>(boot.sim);
  const recRef = useRef(
    (() => {
      const r = createInputRecorder();
      for (const [at, code, a, b] of boot.log) r.record(at, code, a, b);
      return r;
    })()
  );
  const [progress, setProgress] = useState<Record<number, number>>({});
  useEffect(() => setProgress(readProgress()), []);

  const firstStage = (): Stage => {
    if (boot.sim?.over) return 'summary';
    if (boot.resumed) return 'playing';
    if (typeof window !== 'undefined' && !readStore('local', TUTORIAL_KEY)) return 'tutorial';
    return ranked ? 'route' : 'map';
  };
  const [stage, setStage] = useState<Stage>(firstStage);
  const [tiles, setTiles] = useState<ViewTile[]>(() => boot.sim?.view() ?? []);
  const [glass, setGlass] = useState<Uint8Array>(() => boot.sim?.glass.slice() ?? new Uint8Array(COLS * ROWS));
  const [hud, setHud] = useState(() => snapHud(boot.sim));
  const [cursor, setCursor] = useState(27);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<[number, number] | null>(null);
  const [announce, setAnnounce] = useState(boot.resumed ? t.resumed : '');
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [beams, setBeams] = useState<Beam[]>([]);
  const [comboText, setComboText] = useState<{ id: number; text: string } | null>(null);
  const [lastLevel, setLastLevel] = useState<LevelOutcome | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(() => (boot.sim?.over ? makeSummary(boot.sim, null) : null));
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const animatingRef = useRef(false);
  const bufferRef = useRef<[number, number] | null>(null);
  const finishedRef = useRef(false);
  const aliveRef = useRef(true);
  const shakeRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const idSeq = useRef(1);
  const lastInputAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const crossedRef = useRef((boot.sim?.score ?? 0) >= threshold);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  function snapHud(sim: MatchSim | null) {
    if (!sim) return { levelIndex: 0, levelN: 1, moves: 0, points: 0, score: 0, done: 0, total: 1 };
    const g = sim.goalProgress();
    return {
      levelIndex: sim.levelIndex,
      levelN: sim.level.n,
      moves: sim.movesLeft,
      points: sim.points,
      score: sim.score,
      done: g.done,
      total: g.total,
    };
  }

  interface SummaryData {
    score: number;
    reason: 'complete' | 'failed' | 'quit';
    results: LevelOutcome[];
    prevBest: number | null;
    levels: number[];
  }
  function makeSummary(sim: MatchSim, prevBest: number | null): SummaryData {
    return {
      score: sim.score,
      reason: sim.endReason ?? 'quit',
      results: sim.results.slice(),
      prevBest,
      levels: sim.levels.map((l) => l.n),
    };
  }

  const persist = useCallback(() => {
    const sim = simRef.current;
    if (!ranked || !sim) return;
    writeStore('session', runKey(seed), JSON.stringify({ log: recRef.current.entries(), tick: sim.tick }));
  }, [ranked, seed]);

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
        { duration: 240, easing: 'ease-out' }
      );
    },
    [fx]
  );

  const endRun = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const prevBest = readBest(mode);
    // Pratikte koşu = tek seviye; harita ilerlemesini güncelle.
    if (!ranked) {
      const r = sim.results[0];
      if (r?.passed) {
        const p = readProgress();
        p[r.n] = Math.max(p[r.n] ?? 0, r.stars);
        writeStore('local', PROGRESS_KEY, JSON.stringify(p));
        setProgress(p);
      }
    }
    if (prevBest === null || sim.score > prevBest) writeStore('local', bestKey(mode), String(sim.score));
    persist();
    const s = makeSummary(sim, prevBest);
    setSummary(s);
    setHud(snapHud(sim));
    setSelected(null);
    setHint(null);
    setStage('summary');
    const tt = tRef.current;
    setAnnounce(tt.endAnnounce(tt.endHead(s.reason), s.score));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ranked, persist]);

  /** Kozmetik efektler (Math.random yalnız burada; skoru etkilemez). */
  const burst = useCallback(
    (cells: { cell: number; kind: number; sp: Special }[]) => {
      if (!fx.canCelebrate() || reduce) return;
      const out: Spark[] = [];
      for (const c of cells.slice(0, 24)) {
        const color = c.sp === SP_PRISM ? '#ffffff' : (BADGES[c.kind]?.color ?? '#fff');
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 18 + Math.random() * 26;
          out.push({ id: idSeq.current++, x: colOf(c.cell), y: rowOf(c.cell), dx: Math.cos(a) * d, dy: Math.sin(a) * d, color });
        }
      }
      setSparks((s) => [...s, ...out]);
      const ids = new Set(out.map((o) => o.id));
      window.setTimeout(() => aliveRef.current && setSparks((s) => s.filter((x) => !ids.has(x.id))), 560);
    },
    [fx, reduce]
  );

  const playResult = useCallback(
    async (a: number, b: number, r: SwapResult, before: ViewTile[]) => {
      const sim = simRef.current!;
      animatingRef.current = true;
      setSelected(null);
      setHint(null);
      const d = (ms: number) => (reduce ? 0 : ms);

      // 1) Takas
      const swapped = before.map((t) => (t.cell === a ? { ...t, cell: b, drop: 0 } : t.cell === b ? { ...t, cell: a, drop: 0 } : { ...t, drop: 0 }));
      setTiles(swapped);
      if (d(T.swap)) await sleep(d(T.swap));

      // 2) Aşamalar
      for (const p of r.phases) {
        if (!aliveRef.current) return;
        const clearedIds = new Set(p.cleared.map((c) => c.id));
        const createdIds = new Set(p.created.map((c) => c.id));
        setTiles((cur) => [
          ...cur.filter((t) => !createdIds.has(t.id)).map((t) => (clearedIds.has(t.id) ? { ...t, popping: true } : t)),
          ...p.created.map((c) => ({ ...c, drop: 0 })),
        ]);
        setGlass(sim.glass.slice());
        if (p.fired.length && !reduce) {
          const bs = p.fired.map((f) => ({ id: idSeq.current++, sp: f.sp, cell: f.cell }));
          setBeams((x) => [...x, ...bs]);
          const ids = new Set(bs.map((x) => x.id));
          window.setTimeout(() => aliveRef.current && setBeams((x) => x.filter((y) => !ids.has(y.id))), 420);
        }
        burst(p.cleared);
        if (p.fired.some((f) => f.sp === SP_BOMB || f.sp === SP_PRISM)) {
          fx.sfx(() => sfxBoom());
          fx.haptic('big');
          shake(p.fired.some((f) => f.sp === SP_PRISM) ? 6 : 4);
        } else if (p.fired.length) {
          fx.sfx(() => sfxBoom());
          fx.haptic('success');
          shake(2);
        } else {
          fx.sfx(() => sfxCombo(Math.min(6, p.depth - 1)));
          fx.haptic('tap');
        }
        if (p.created.length) fx.sfx(() => sfxPowerUp());
        if (p.depth >= 2) {
          const text = tRef.current.combo(p.depth, p.depth >= 4);
          setComboText({ id: idSeq.current++, text });
        }
        if (d(T.pop)) await sleep(d(T.pop));
        if (!aliveRef.current) return;
        setTiles(p.after);
        if (d(T.fall)) await sleep(d(T.fall));
      }
      if (r.shuffled && aliveRef.current) {
        setAnnounce(tRef.current.shuffled);
        setTiles(r.shuffled);
        if (d(T.shuffle)) await sleep(d(T.shuffle));
      }
      if (!aliveRef.current) return;
      animatingRef.current = false;
      setHud(snapHud(sim));
      lastInputAt.current = Date.now();

      const tt = tRef.current;
      const parts: string[] = [];
      const total = r.phases.reduce((s, p) => s + p.cleared.length, 0);
      parts.push(tt.cleared(total, r.gained));
      const created = r.phases.flatMap((p) => p.created);
      if (created.length) parts.push(tt.specials(created.map((cr) => tt.special[cr.sp] ?? '').join(', ')));
      if (r.phases.length > 1) parts.push(tt.comboLine(r.phases.length));

      if (r.level) {
        const lv = r.level;
        setLastLevel(lv);
        if (lv.passed) {
          fx.sfx(() => sfxWin());
          fx.haptic('success');
          fx.confetti('sides');
          parts.push(tt.levelPassed(lv.n, lv.stars, lv.levelScore));
        } else {
          fx.sfx(() => sfxHit());
          fx.haptic('big');
          parts.push(tt.levelFailed(lv.n));
        }
        if (ranked && !crossedRef.current && sim.score >= threshold) {
          crossedRef.current = true;
          fx.sfx(() => sfxFanfare());
          parts.push(tt.thresholdLine(threshold));
        }
        setAnnounce(parts.join(' '));
        if (sim.over) {
          if (sim.endReason === 'complete') fx.confetti('sides');
          endRun();
        } else {
          setStage('levelEnd');
        }
        return;
      }
      parts.push(tt.movesLeftLine(sim.movesLeft));
      setAnnounce(parts.join(' '));
    },
    [reduce, burst, fx, shake, ranked, threshold, endRun, tRef]
  );

  const trySwap = useCallback(
    (a: number, b: number) => {
      const sim = simRef.current;
      if (!sim || stage !== 'playing' || paused || sim.over) return;
      if (!adjacent(a, b)) return;
      if (animatingRef.current || !sim.ready()) {
        bufferRef.current = [a, b];
        return;
      }
      lastInputAt.current = Date.now();
      const before = tiles;
      const r = sim.swap(a, b);
      if (!r.ok) {
        if (r.reason === 'busy') {
          bufferRef.current = [a, b];
          return;
        }
        // Geçersiz: ileri-geri esneme.
        fx.sfx(() => sfxClick());
        fx.haptic('tap');
        setSelected(null);
        setAnnounce(tRef.current.noMatch);
        if (!reduce) {
          const dx = colOf(b) - colOf(a);
          const dy = rowOf(b) - rowOf(a);
          setTiles((cur) =>
            cur.map((t) =>
              t.cell === a ? { ...t, nudge: { dx: dx * 0.35, dy: dy * 0.35 } } : t.cell === b ? { ...t, nudge: { dx: -dx * 0.35, dy: -dy * 0.35 } } : t
            )
          );
          window.setTimeout(() => aliveRef.current && setTiles((cur) => cur.map((t) => (t.nudge ? { ...t, nudge: undefined } : t))), 150);
        }
        return;
      }
      recRef.current.record(sim.lastSwapTick, CODE_SWAP, a, b);
      persist();
      void playResult(a, b, r, before);
    },
    [stage, paused, tiles, fx, reduce, persist, playResult]
  );

  useGameLoop({
    active: stage === 'playing' || stage === 'levelEnd',
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      const sim = simRef.current;
      if (!sim || sim.over) return;
      sim.step();
      const buf = bufferRef.current;
      if (buf && !animatingRef.current && sim.ready()) {
        bufferRef.current = null;
        trySwap(buf[0], buf[1]);
      }
    },
    render: () => {},
  });

  useEffect(() => {
    if (paused) bufferRef.current = null;
  }, [paused]);

  // Periyodik kayıt (tick ilerlesin diye).
  useEffect(() => {
    if (stage !== 'playing' || !ranked) return;
    const id = window.setInterval(persist, 5000);
    return () => window.clearInterval(id);
  }, [stage, ranked, persist]);

  // Boşta kalınca ipucu.
  useEffect(() => {
    if (stage !== 'playing' || paused) return;
    const id = window.setInterval(() => {
      const sim = simRef.current;
      if (!sim || animatingRef.current || hint || Date.now() - lastInputAt.current < HINT_AFTER_MS) return;
      const m = sim.findMove();
      if (m) setHint(m);
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, paused, hint]);

  const quit = useCallback(() => {
    const sim = simRef.current;
    if (!sim || sim.over) return;
    if (sim.end()) {
      recRef.current.record(sim.tick, CODE_END);
      endRun();
    }
  }, [endRun]);

  // Sıralı: oturum süresi dolmadan kendiliğinden bitir (sonuç kaybolmasın).
  const maxSec = config.maxDurationSec ?? 1200;
  useEffect(() => {
    if (!ranked || stage === 'summary') return;
    const id = window.setInterval(() => {
      const left = Math.round(maxSec - SESSION_SAFETY_SEC - (Date.now() - startedAt.current) / 1000);
      setTimeLeft(left);
      if (left <= 0 && !animatingRef.current) {
        setAnnounce(tRef.current.sessionEnding);
        quit();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [ranked, stage, maxSec, quit, tRef]);

  // "Bitir": basılı tut (yanlış dokunuşla günün hakkı yanmasın).
  const [hold, setHold] = useState(0);
  const holdRef = useRef<number | null>(null);
  const cancelHold = () => {
    if (holdRef.current) cancelAnimationFrame(holdRef.current);
    holdRef.current = null;
    setHold(0);
  };
  const startHold = () => {
    if (stage !== 'playing' || paused || animatingRef.current) return;
    const start = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        holdRef.current = null;
        setHold(0);
        quit();
        return;
      }
      holdRef.current = requestAnimationFrame(tick);
    };
    holdRef.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelHold(), []);

  const submit = useCallback(() => {
    const sim = simRef.current;
    if (finishedRef.current || !sim) return;
    finishedRef.current = true;
    onFinish({
      score: sim.score,
      won: sim.score >= threshold,
      proof: ranked ? { log: recRef.current.entries() as DeterministicProof['log'], steps: sim.tick } : undefined,
    });
  }, [onFinish, threshold, ranked]);

  const [autoLeft, setAutoLeft] = useState(AUTO_SUBMIT_SEC);
  useEffect(() => {
    if (stage !== 'summary' || !ranked || paused) return;
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
  }, [stage, ranked, paused, submit]);

  useEffect(() => {
    if (stage === 'playing') boardRef.current?.focus();
  }, [stage]);

  // ───────── akış ─────────

  const finishTutorial = () => {
    writeStore('local', TUTORIAL_KEY, '1');
    setStage(simRef.current && boot.resumed ? 'playing' : ranked ? 'route' : 'map');
  };

  const beginLevelView = (sim: MatchSim) => {
    setTiles(sim.view());
    setGlass(sim.glass.slice());
    setHud(snapHud(sim));
    setSelected(null);
    setHint(null);
    lastInputAt.current = Date.now();
    setAnnounce(t.levelStart(sim.level.n, goalText(sim.level), sim.movesLeft));
    setStage('playing');
  };

  const startPractice = (n: number) => {
    const sim = createMatchSim(seed, [n]);
    simRef.current = sim;
    recRef.current.clear();
    beginLevelView(sim);
  };

  const startRanked = () => {
    const sim = simRef.current;
    if (!sim) return;
    startedAt.current = Date.now();
    beginLevelView(sim);
  };

  const nextLevel = () => {
    const sim = simRef.current;
    if (sim) beginLevelView(sim);
  };

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    if (!summary) return;
    const url = `${window.location.origin}/customer/games/match-three`;
    const passed = summary.results.filter((r) => r.passed).length;
    const text = ranked
      ? t.shareRanked(passed, summary.score)
      : t.sharePractice(summary.levels[0], summary.results[0]?.stars ?? 0);
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

  // ───────── girdi ─────────

  const cellFromPoint = (x: number, y: number): number | null => {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = Math.floor(((x - r.left) / r.width) * COLS);
    const rr = Math.floor(((y - r.top) / r.height) * ROWS);
    if (c < 0 || c >= COLS || rr < 0 || rr >= ROWS) return null;
    return rr * COLS + c;
  };
  const drag = useRef<{ x: number; y: number; cell: number; swiped: boolean; pid: number } | null>(null);

  const onPointerDown = (e: RPointerEvent) => {
    if (stage !== 'playing' || paused) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell === null) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* eski tarayıcı */
    }
    drag.current = { x: e.clientX, y: e.clientY, cell, swiped: false, pid: e.pointerId };
    setCursor(cell);
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.swiped || d.pid !== e.pointerId) return;
    const el = boardRef.current;
    if (!el) return;
    const size = el.getBoundingClientRect().width / COLS;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < size * 0.35) return;
    d.swiped = true;
    const r = rowOf(d.cell);
    const c = colOf(d.cell);
    let to = -1;
    if (Math.abs(dx) > Math.abs(dy)) to = dx > 0 ? (c < COLS - 1 ? d.cell + 1 : -1) : c > 0 ? d.cell - 1 : -1;
    else to = dy > 0 ? (r < ROWS - 1 ? d.cell + COLS : -1) : r > 0 ? d.cell - COLS : -1;
    if (to >= 0) trySwap(d.cell, to);
  };
  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.swiped || d.pid !== e.pointerId) return;
    const cell = d.cell;
    if (selected !== null && selected !== cell && adjacent(selected, cell)) {
      trySwap(selected, cell);
    } else {
      setSelected(selected === cell ? null : cell);
      if (selected !== cell) fx.sfx(() => sfxClick());
    }
  };

  const onKeyDown = (e: RKeyboardEvent) => {
    if (stage !== 'playing') return;
    const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') {
      e.preventDefault();
      onPauseRequest();
      return;
    }
    if (paused) return;
    const r = rowOf(cursor);
    const c = colOf(cursor);
    let to = -1;
    if (k === 'ArrowUp' && r > 0) to = cursor - COLS;
    else if (k === 'ArrowDown' && r < ROWS - 1) to = cursor + COLS;
    else if (k === 'ArrowLeft' && c > 0) to = cursor - 1;
    else if (k === 'ArrowRight' && c < COLS - 1) to = cursor + 1;
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      if (to < 0) return;
      if (selected === cursor) {
        trySwap(cursor, to);
        setCursor(to);
      } else {
        setCursor(to);
      }
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (selected !== null && selected !== cursor && adjacent(selected, cursor)) trySwap(selected, cursor);
      else setSelected(selected === cursor ? null : cursor);
      return;
    }
    if (k === 'h' || k === 'H') {
      const m = simRef.current?.findMove();
      if (m) {
        setHint(m);
        setCursor(m[0]);
        setAnnounce(t.hint(describeCell(m[0]), describeCell(m[1])));
      }
    }
  };

  const tileAt = useMemo(() => {
    const map = new Map<number, ViewTile>();
    for (const t of tiles) if (!t.popping) map.set(t.cell, t);
    return map;
  }, [tiles]);

  function describeCell(cell: number): string {
    const tile = tileAt.get(cell);
    const name = tile
      ? tile.sp === SP_PRISM
        ? t.prism
        : `${t.badge[tile.kind] ?? ''}${tile.sp ? ` (${t.special[tile.sp] ?? ''})` : ''}`
      : t.empty;
    return t.cell(rowOf(cell) + 1, colOf(cell) + 1, name, !!glass[cell]);
  }

  // ───────── çizim ─────────

  const sim = simRef.current;
  const level = sim?.level ?? LEVELS[0];
  const cellPct = 100 / COLS;
  const pos = (cell: number, nudge?: { dx: number; dy: number }) =>
    `translate(${(colOf(cell) + (nudge?.dx ?? 0)) * 100}%, ${(rowOf(cell) + (nudge?.dy ?? 0)) * 100}%)`;
  const fmt = (n: number) => n.toLocaleString(t.numberLocale);
  const unlocked = unlockedUpTo(progress);
  const routeLevels = useMemo(() => (ranked ? rankedLevels(seed) : []), [ranked, seed]);
  const lowMoves = hud.moves <= 3;

  return (
    <div className="mx-auto w-full max-w-[440px] select-none text-white">
      <style>{`
        @keyframes m3-drop { from { transform: translateY(calc(var(--m3-drop) * -100%)); } to { transform: translateY(0); } }
        @keyframes m3-pop { 0% { transform: scale(1); opacity: 1 } 40% { transform: scale(1.18); opacity: 1 } 100% { transform: scale(0.1); opacity: 0 } }
        @keyframes m3-hint { 0%,100% { transform: scale(1) } 50% { transform: scale(1.12) } }
        @keyframes m3-spark { from { transform: translate(0,0) scale(1); opacity: 1 } to { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0 } }
        @keyframes m3-beam { from { opacity: .95 } to { opacity: 0 } }
        @keyframes m3-combo { 0% { transform: translateY(8px) scale(.8); opacity: 0 } 25% { transform: translateY(0) scale(1.08); opacity: 1 } 100% { transform: translateY(-14px) scale(1); opacity: 0 } }
        .m3-drop { animation: m3-drop ${T.fall}ms cubic-bezier(.3,.7,.4,1) both }
        .m3-pop { animation: m3-pop ${T.pop}ms ease-in forwards }
        .m3-hint { animation: m3-hint 900ms ease-in-out infinite }
        .m3-spark { animation: m3-spark 520ms ease-out forwards }
        .m3-beam { animation: m3-beam 400ms ease-out forwards }
        .m3-combo { animation: m3-combo 900ms ease-out forwards }
        @media (prefers-reduced-motion: reduce) { .m3-drop, .m3-pop, .m3-hint, .m3-spark, .m3-beam, .m3-combo { animation: none } }
      `}</style>

      {/* HUD */}
      <div className="mb-2 flex items-stretch gap-2">
        <dl className="grid flex-1 grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              {ranked ? t.levelOf(hud.levelIndex + 1) : t.level}
            </dt>
            <dd className="text-lg font-black tabular-nums leading-tight">{hud.levelN}</dd>
          </div>
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{t.moves}</dt>
            <dd className={`text-lg font-black tabular-nums leading-tight ${lowMoves && stage === 'playing' ? 'text-[#ffb4a8]' : ''}`}>
              {hud.moves}
            </dd>
          </div>
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{ranked ? t.score : t.points}</dt>
            <dd className="text-lg font-black tabular-nums leading-tight">{fmt(ranked ? hud.score : hud.points)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onPauseRequest}
          className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={c.pause}
        >
          <Pause className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm">
          <p className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{goalText(level)}</span>
            <GoalChip level={level} done={hud.done} total={hud.total} />
          </p>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label={t.goalProgress}
            aria-valuemin={0}
            aria-valuemax={hud.total}
            aria-valuenow={hud.done}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${(hud.done / Math.max(1, hud.total)) * 100}%`, background: accent }}
            />
          </div>
          {ranked && (
            <p className="mt-1 text-xs text-white/70">
              {hud.score >= threshold
                ? t.passedHint
                : t.toGo(threshold, threshold - hud.score)}
              {timeLeft !== null && timeLeft <= 180 && stage !== 'summary' ? t.session(Math.max(0, timeLeft)) : ''}
            </p>
          )}
        </div>
        {stage === 'playing' && (
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
            aria-label={t.bankLabel}
            className="relative flex h-11 shrink-0 touch-manipulation items-center gap-1.5 overflow-hidden rounded-xl border border-white/20 px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span aria-hidden className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${hold * 100}%` }} />
            <Flag className="relative h-4 w-4" aria-hidden />
            <span className="relative">{hold > 0 ? t.holding : t.bank}</span>
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p id="m3-rules" className="sr-only">
        {t.rules(goalText(level), hud.moves)}
      </p>

      <div ref={shakeRef}>
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-[#1d1638] p-[1.5%] shadow-inner">
          <div
            ref={boardRef}
            tabIndex={stage === 'playing' ? 0 : -1}
            role="grid"
            aria-label={t.board(level.n)}
            aria-describedby="m3-rules"
            aria-activedescendant={stage === 'playing' ? `m3-cell-${cursor}` : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={onKeyDown}
            onFocus={() => setAnnounce(describeCell(cursor))}
            className="relative h-full w-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            {/* Hücre zemini + cam */}
            {Array.from({ length: COLS * ROWS }, (_, cell) => (
              <div
                key={`bg-${cell}`}
                aria-hidden
                className="absolute left-0 top-0 p-[3%]"
                style={{ width: `${cellPct}%`, height: `${cellPct}%`, transform: pos(cell) }}
              >
                <div
                  className={`h-full w-full rounded-[22%] ${(rowOf(cell) + colOf(cell)) % 2 ? 'bg-white/[0.06]' : 'bg-white/[0.1]'}`}
                  style={
                    glass[cell]
                      ? {
                          background: 'linear-gradient(135deg, rgba(186,230,253,.55), rgba(125,211,252,.25))',
                          boxShadow: 'inset 0 0 0 2px rgba(224,242,254,.85)',
                        }
                      : undefined
                  }
                />
              </div>
            ))}

            {/* Taşlar */}
            {tiles.map((t) => {
              const isSel = selected === t.cell && !t.popping;
              const isHint = !!hint && (hint[0] === t.cell || hint[1] === t.cell) && !t.popping;
              return (
                <div
                  key={t.id}
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 p-[5%]"
                  style={{
                    width: `${cellPct}%`,
                    height: `${cellPct}%`,
                    transform: pos(t.cell, t.nudge),
                    transition: reduce ? 'none' : `transform ${T.fall}ms cubic-bezier(.3,.7,.4,1)`,
                    zIndex: isSel ? 3 : 2,
                  }}
                >
                  <div
                    className={[
                      'h-full w-full',
                      t.drop > 0 && !reduce ? 'm3-drop' : '',
                      t.popping && !reduce ? 'm3-pop' : '',
                      isHint && !reduce ? 'm3-hint' : '',
                    ].join(' ')}
                    style={{ ['--m3-drop' as string]: String(t.drop), opacity: t.popping && reduce ? 0 : undefined } as CSSProperties}
                  >
                    <div
                      className="h-full w-full rounded-[24%]"
                      style={{
                        outline: isSel ? '3px solid #fff' : isHint ? '3px dashed #fff' : undefined,
                        outlineOffset: 1,
                      }}
                    >
                      <BadgeGlyph kind={t.kind} sp={t.sp} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Işınlar / patlamalar */}
            {beams.map((b) => {
              const r = rowOf(b.cell);
              const c = colOf(b.cell);
              const style: CSSProperties =
                b.sp === SP_LINE_H
                  ? { left: 0, right: 0, top: `${r * cellPct + cellPct * 0.3}%`, height: `${cellPct * 0.4}%` }
                  : b.sp === SP_LINE_V
                    ? { top: 0, bottom: 0, left: `${c * cellPct + cellPct * 0.3}%`, width: `${cellPct * 0.4}%` }
                    : b.sp === SP_BOMB
                      ? {
                          left: `${(c - 1) * cellPct}%`,
                          top: `${(r - 1) * cellPct}%`,
                          width: `${cellPct * 3}%`,
                          height: `${cellPct * 3}%`,
                          borderRadius: '50%',
                        }
                      : { inset: 0 };
              return (
                <div
                  key={b.id}
                  aria-hidden
                  className="m3-beam pointer-events-none absolute z-[4]"
                  style={{
                    ...style,
                    background:
                      b.sp === SP_PRISM
                        ? 'radial-gradient(circle, rgba(255,255,255,.55), rgba(255,255,255,0) 70%)'
                        : 'radial-gradient(circle, rgba(255,255,255,.95), rgba(255,240,180,.4) 60%, rgba(255,255,255,0))',
                  }}
                />
              );
            })}

            {/* Parçacıklar (kozmetik) */}
            {sparks.map((s) => (
              <span
                key={s.id}
                aria-hidden
                className="m3-spark pointer-events-none absolute z-[5] h-2 w-2 rounded-full"
                style={
                  {
                    left: `${(s.x + 0.5) * cellPct}%`,
                    top: `${(s.y + 0.5) * cellPct}%`,
                    background: s.color,
                    ['--dx' as string]: `${s.dx}px`,
                    ['--dy' as string]: `${s.dy}px`,
                  } as CSSProperties
                }
              />
            ))}

            {comboText && !reduce && (
              <div
                key={comboText.id}
                aria-hidden
                className="m3-combo pointer-events-none absolute inset-x-0 top-[40%] z-[6] text-center text-3xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]"
              >
                {comboText.text}
              </div>
            )}

            {/* Erişilebilir ızgara (görsel taşların metin karşılığı; klavye imleci). */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-8 grid-rows-8">
              {Array.from({ length: ROWS }, (_, r) => (
                <div key={r} role="row" className="contents">
                  {Array.from({ length: COLS }, (_, c) => {
                    const cell = r * COLS + c;
                    const active = stage === 'playing' && cursor === cell;
                    return (
                      <div
                        key={c}
                        id={`m3-cell-${cell}`}
                        role="gridcell"
                        aria-selected={selected === cell}
                        aria-label={describeCell(cell)}
                        className={active ? 'z-[7] rounded-[22%] ring-2 ring-inset ring-white/90' : ''}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ───────── Katmanlar ───────── */}

          {stage === 'tutorial' && (
            <Overlay labelledBy="m3-tut-title">
              <h3 id="m3-tut-title" className="text-xl font-bold">
                {c.howTo}
              </h3>
              <ol className="max-w-sm space-y-2.5 text-left text-sm">
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-block h-6 w-6 shrink-0">
                    <BadgeGlyph kind={4} sp={SP_NONE} />
                  </span>
                  <span>
                    <b>{t.swapTitle}</b>
                    {t.swapBody}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-block h-6 w-6 shrink-0">
                    <BadgeGlyph kind={2} sp={SP_LINE_H} />
                  </span>
                  <span>
                    <b>{t.lineTitle}</b>
                    {t.lineBody}
                    <b>{t.bombTitle}</b>
                    {t.bombBody}
                    <b>{t.prismTitle}</b>
                    {t.prismBody}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-block h-6 w-6 shrink-0 rounded border-2 border-sky-200 bg-sky-200/40" aria-hidden />
                  <span>
                    <b>{t.goalsTitle}</b>
                    {t.goalsBody}
                  </span>
                </li>
                <li className="flex gap-3">
                  <Star className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" aria-hidden />
                  <span>
                    <b>{t.starTitle}</b>
                    {t.starBody}
                    {ranked ? t.starRanked(threshold) : t.starPractice}
                  </span>
                </li>
              </ol>
              <p className="text-xs text-white/70">{t.keys}</p>
              <button type="button" autoFocus onClick={finishTutorial} className={btnPrimary} style={{ background: '#F5C542' }}>
                {t.gotIt}
              </button>
            </Overlay>
          )}

          {stage === 'route' && (
            <Overlay labelledBy="m3-route-title">
              <MapIcon className="h-8 w-8 text-amber-300" aria-hidden />
              <h3 id="m3-route-title" className="text-xl font-bold">
                {t.routeTitle}
              </h3>
              <p className="max-w-xs text-sm text-white/80">
                {t.routeBody}
              </p>
              <ol className="w-full max-w-xs space-y-1.5 text-left text-sm">
                {routeLevels.map((n, i) => {
                  const l = LEVELS[n - 1];
                  return (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-2">
                      <span className="font-bold">
                        {t.routeItem(i + 1, n)}
                      </span>
                      <span className="truncate text-white/80">
                        {goalText(l)} · {t.movesCount(l.moves)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <button type="button" autoFocus onClick={startRanked} className={btnPrimary} style={{ background: '#F5C542' }}>
                {t.start}
              </button>
            </Overlay>
          )}

          {stage === 'map' && (
            <Overlay labelledBy="m3-map-title">
              <h3 id="m3-map-title" className="text-xl font-bold">
                {t.mapTitle}
              </h3>
              <p className="text-xs text-white/70">{t.mapProgress(unlocked, LEVEL_COUNT)}</p>
              <ol className="grid w-full max-w-sm grid-cols-5 gap-2">
                {LEVELS.map((l) => {
                  const open = l.n <= unlocked;
                  const st = progress[l.n] ?? 0;
                  return (
                    <li key={l.n}>
                      <button
                        type="button"
                        disabled={!open}
                        onClick={() => startPractice(l.n)}
                        aria-label={
                          open
                            ? t.mapOpen(l.n, goalText(l), l.moves, st)
                            : t.mapLocked(l.n)
                        }
                        className={`flex h-14 w-full flex-col items-center justify-center rounded-xl text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                          open ? 'bg-white/15 hover:bg-white/25' : 'cursor-not-allowed bg-white/5 text-white/40'
                        } ${l.n === unlocked ? 'ring-2 ring-amber-300' : ''}`}
                      >
                        {open ? l.n : <Lock className="h-4 w-4" aria-hidden />}
                        {open && (
                          <span className="mt-0.5 flex gap-px" aria-hidden>
                            {[1, 2, 3].map((i) => (
                              <Star key={i} className="h-2.5 w-2.5" fill={i <= st ? '#F5C542' : 'none'} style={{ color: i <= st ? '#F5C542' : 'rgba(255,255,255,.35)' }} />
                            ))}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Overlay>
          )}

          {stage === 'levelEnd' && lastLevel && (
            <Overlay labelledBy="m3-lv-title">
              <h3 id="m3-lv-title" className="text-xl font-bold">
                {t.levelDone(lastLevel.n)}
              </h3>
              <Stars n={lastLevel.stars} size="h-10 w-10" />
              <p className="text-sm text-white/80">
                {t.levelEndStats(lastLevel.movesLeft, lastLevel.levelScore)}
              </p>
              <p className="text-3xl font-black tabular-nums">{fmt(hud.score)}</p>
              <p className="text-xs text-white/70">
                {t.nextUp(level.n, goalText(level), level.moves)}
              </p>
              <button type="button" autoFocus onClick={nextLevel} className={btnPrimary} style={{ background: '#F5C542' }}>
                {t.nextLevel}
              </button>
            </Overlay>
          )}

          {stage === 'summary' && summary && (
            <Overlay labelledBy="m3-sum-title">
              <h3 id="m3-sum-title" className="text-xl font-bold">
                {summary.reason === 'complete'
                  ? ranked
                    ? t.routeDone
                    : t.levelDone(summary.levels[0])
                  : summary.reason === 'failed'
                    ? t.outOfMoves
                    : t.ended}
              </h3>
              <Stars
                n={ranked ? runStars(summary.score, threshold, maxScore) : (summary.results[0]?.stars ?? 0)}
                size="h-9 w-9"
              />
              <p className="text-4xl font-black tabular-nums">{fmt(summary.score)}</p>
              <p className="text-xs text-white/75">
                {summary.prevBest === null
                  ? c.firstScore
                  : summary.score > summary.prevBest
                    ? c.newBest(fmt(summary.prevBest))
                    : c.best(fmt(summary.prevBest))}
                {ranked ? '' : c.practiceSuffix}
              </p>
              {ranked && (
                <ol className="w-full max-w-xs space-y-1 text-left text-xs">
                  {summary.levels.map((n, i) => {
                    const r = summary.results[i];
                    return (
                      <li key={i} className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-1.5">
                        <span>
                          {t.routeItem(i + 1, n)}
                        </span>
                        {r ? (
                          r.passed ? (
                            <span className="flex items-center gap-2">
                              <Stars n={r.stars} size="h-3.5 w-3.5" />
                              <span className="tabular-nums">+{r.levelScore}</span>
                            </span>
                          ) : (
                            <span className="text-[#ffb4a8]">{t.failed}</span>
                          )
                        ) : (
                          <span className="text-white/50">{t.notPlayed}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="max-w-xs text-xs text-white/75">
                {ranked
                  ? summary.score >= threshold
                    ? t.passedRanked
                    : t.remaining(threshold, threshold - summary.score)
                  : t.practiceNote}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={share} className={btnGhost}>
                  <Share2 className="h-4 w-4" aria-hidden /> {c.share}
                </button>
                <button type="button" autoFocus onClick={submit} className={btnPrimary} style={{ background: '#F5C542' }}>
                  {ranked ? <Trophy className="h-4 w-4" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                  {ranked ? c.save(autoLeft) : c.cont}
                </button>
              </div>
              <p className="min-h-[1rem] text-xs text-white/75" aria-live="polite">
                {shareNote}
              </p>
            </Overlay>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-white/70">
        {boot.resumed && stage === 'playing' ? t.resumedFoot : ''}
        {ranked ? t.footRanked : c.footPractice}
      </p>
    </div>
  );
}
