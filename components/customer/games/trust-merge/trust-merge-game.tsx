'use client';

/**
 * Güven Birleştir — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Mantık saf `sim.ts`'te (tohumlu); sunucu aynı tohum + girdi kaydıyla yeniden oynatır. Skor =
 * birleşim puanı (normalize edilmiş birim). Tahta DOM'da çizilir: karolar `transform` ile kayar
 * (layout değil), yutulan karo hedefe kayıp söner, birleşen karo kayma bittikten sonra "pop" yapar,
 * yeni karo gecikmeyle doğar. Azaltılmış harekette tüm süreler 0.
 *
 * Sağlamlık: sıralı modda kayıt sessionStorage'a yazılır (tohum anahtarlı) → yenilemede aynı
 * tahta aynı noktadan devam eder (yeniden çekme anlamsız: tohum sunucuda sabit). Hızlı oyuncunun
 * erken gelen hamlesi tek elemanlı tamponda bekler (yutulmaz).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Flag, Pause, RotateCcw, Share2, Sparkles, Star, Trophy } from 'lucide-react';
import { useCoarsePointer, useGameInput, useGameLoop } from '@/lib/games/engine/hooks';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import type { GameAction } from '@/lib/games/engine/input';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion-pref';
import { sfxClick, sfxCollectStar, sfxFanfare, sfxHit, sfxWin } from '@/lib/game-sounds';
import {
  CODE_BANK,
  DIR,
  DIR_TEXT,
  SIZE,
  createMergeSim,
  starsFor,
  type Dir,
  type EndReason,
  type MergeSim,
  type MoveResult,
} from './sim';

const TUTORIAL_KEY = 'qx.trust-merge.tutorial.v2';
const bestKey = (mode: string) => `qx.trust-merge.best.${mode}`;
const runKey = (seed: string) => `qx.trust-merge.run.${seed}`;
const AUTO_SUBMIT_SEC = 15;
const SLIDE_MS = 110;
const HOLD_MS = 700;

const KEYMAP: Readonly<Record<string, GameAction>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Escape: 'pause',
  KeyP: 'pause',
};
const ACTION_DIR: Partial<Record<GameAction, Dir>> = { up: DIR.UP, down: DIR.DOWN, left: DIR.LEFT, right: DIR.RIGHT };

/**
 * Karo paleti: değer büyüdükçe sıcak → serin (renk körlüğünde de ayırt edilir; asıl ayırt edici
 * her zaman rakam). Metin/zemin kontrastı ≥ 4,5:1 (koyu metin) ya da büyük kalın metinde ≥ 3:1.
 */
const TILE: Record<number, { bg: string; fg: string }> = {
  2: { bg: '#f1e9da', fg: '#3b2f1e' },
  4: { bg: '#ead8b1', fg: '#3b2f1e' },
  8: { bg: '#f2b179', fg: '#3b1d06' },
  16: { bg: '#f59563', fg: '#3b1206' },
  32: { bg: '#f67c5f', fg: '#2a0a03' },
  64: { bg: '#e5533b', fg: '#1f0703' },
  128: { bg: '#edcf72', fg: '#2b2104' },
  256: { bg: '#e9c349', fg: '#2b2104' },
  512: { bg: '#3fa796', fg: '#04201b' },
  1024: { bg: '#2563eb', fg: '#ffffff' },
  2048: { bg: '#7c3aed', fg: '#ffffff' },
};
const tileStyle = (v: number) => TILE[v] ?? { bg: '#111827', fg: '#fbbf24' };

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

interface ViewTile {
  id: number;
  value: number;
  cell: number;
  kind: 'still' | 'spawn' | 'merged' | 'ghost';
}

function boardView(sim: MergeSim): ViewTile[] {
  const out: ViewTile[] = [];
  sim.board.forEach((t, cell) => {
    if (t) out.push({ id: t.id, value: t.value, cell, kind: 'still' });
  });
  return out;
}

function viewAfterMove(sim: MergeSim, r: MoveResult): ViewTile[] {
  const mergedIds = new Set(r.merges.map((m) => m.id));
  const out: ViewTile[] = [];
  for (const m of r.motions) {
    if (m.absorbed) {
      // Yutulan iki karo da hedefe kayar, ardından söner; yerine birleşen karo "pop" yapar.
      const cur = sim.board[m.to];
      const prevValue = cur ? cur.value / 2 : 0;
      out.push({ id: m.id, value: prevValue, cell: m.to, kind: 'ghost' });
    }
  }
  sim.board.forEach((t, cell) => {
    if (!t) return;
    const kind = mergedIds.has(t.id) ? 'merged' : r.spawn && r.spawn.id === t.id ? 'spawn' : 'still';
    out.push({ id: t.id, value: t.value, cell, kind });
  });
  return out;
}

interface Hud {
  score: number;
  maxTile: number;
  moves: number;
}
const snap = (s: MergeSim): Hud => ({ score: s.score, maxTile: s.maxTile, moves: s.moves });

interface Summary {
  score: number;
  maxTile: number;
  moves: number;
  reason: EndReason;
  stars: 0 | 1 | 2 | 3;
  prevBest: number | null;
}

interface Restored {
  sim: MergeSim;
  log: InputLog;
  resumed: boolean;
}

function readBest(mode: string): number | null {
  const raw = readStore('local', bestKey(mode));
  return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

/** Kayıttan tahtayı birebir yeniden kurar (yalnız sıralıda, aynı tohumla). */
function restore(seed: string, mode: string): Restored {
  const fresh = (): Restored => ({ sim: createMergeSim(seed), log: [], resumed: false });
  if (mode !== 'ranked' || typeof window === 'undefined') return fresh();
  const raw = readStore('session', runKey(seed));
  if (!raw) return fresh();
  try {
    const data = JSON.parse(raw) as { log: InputLog; tick: number };
    if (!Array.isArray(data.log) || data.log.length === 0) return fresh();
    const sim = createMergeSim(seed);
    for (const [at, code] of data.log) {
      sim.setTick(at);
      // Bitmiş oyun da geri yüklenir (özet ekranına döner): yenileyip aynı tahtayı baştan
      // denemek mümkün olmasın.
      if (code === CODE_BANK) {
        if (!sim.bank()) return fresh();
        continue;
      }
      if (!sim.move(code as Dir).moved) return fresh();
    }
    if (!sim.over) sim.setTick(Number(data.tick) || 0);
    return { sim, log: data.log, resumed: true };
  } catch {
    return fresh();
  }
}

export function TrustMergeGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx, accent }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const reduce = useReducedMotionPref();
  const coarse = useCoarsePointer();
  const [boot] = useState<Restored>(() => restore(seed, mode));
  const sim = boot.sim;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() =>
    sim.over ? 'summary' : readStore('local', TUTORIAL_KEY) ? 'playing' : 'tutorial'
  );
  const recRef = useRef(
    (() => {
      const r = createInputRecorder();
      for (const [at, code] of boot.log) r.record(at, code);
      return r;
    })()
  );
  const [tiles, setTiles] = useState<ViewTile[]>(() => boardView(sim));
  const [hud, setHud] = useState<Hud>(() => snap(sim));
  const [announce, setAnnounce] = useState(boot.resumed ? 'Kaldığın yerden devam ediyorsun.' : '');
  const [summary, setSummary] = useState<Summary | null>(() =>
    sim.over
      ? {
          score: sim.score,
          maxTile: sim.maxTile,
          moves: sim.moves,
          reason: sim.endReason ?? 'stuck',
          stars: starsFor(sim.score, threshold),
          prevBest: null,
        }
      : null
  );
  const [glow, setGlow] = useState<number | null>(null);
  const bufferRef = useRef<Dir | null>(null);
  const finishedRef = useRef(false);
  const shakeRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const crossedRef = useRef(sim.score >= threshold);
  const ghostTimer = useRef<number | undefined>(undefined);

  const playing = stage === 'playing';

  const persist = useCallback(() => {
    if (mode !== 'ranked') return;
    writeStore('session', runKey(seed), JSON.stringify({ log: recRef.current.entries(), tick: sim.tick }));
  }, [mode, seed, sim]);

  const endRun = useCallback(
    (reason: EndReason) => {
      const prevBest = readBest(mode);
      if (prevBest === null || sim.score > prevBest) writeStore('local', bestKey(mode), String(sim.score));
      persist();
      const s: Summary = {
        score: sim.score,
        maxTile: sim.maxTile,
        moves: sim.moves,
        reason,
        stars: starsFor(sim.score, threshold),
        prevBest,
      };
      setSummary(s);
      setHud(snap(sim));
      setStage('summary');
      setAnnounce(
        `${reason === 'bank' ? 'Oyunu bitirdin' : 'Hamle kalmadı'}. Puan ${s.score}, en yüksek karo ${s.maxTile}, ${s.stars} yıldız.`
      );
    },
    [mode, sim, threshold, persist]
  );

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

  const applyMove = useCallback(
    (dir: Dir): boolean => {
      const r = sim.move(dir);
      if (!r.moved) return false;
      recRef.current.record(sim.lastMoveTick, dir);
      persist();
      setTiles(viewAfterMove(sim, r));
      window.clearTimeout(ghostTimer.current);
      ghostTimer.current = window.setTimeout(() => setTiles(boardView(sim)), reduce ? 0 : SLIDE_MS + 40);
      setHud(snap(sim));

      // Juice — hepsi fx politikasından geçer (azaltılmışta no-op).
      if (r.merges.length) {
        const top = Math.max(...r.merges.map((m) => m.value));
        fx.sfx(() => sfxCollectStar(Math.min(7, Math.log2(top) - 2)));
        fx.haptic('tap');
        if (top >= 64) {
          const cell = r.merges.find((m) => m.value === top)!.cell;
          setGlow(cell);
          window.setTimeout(() => setGlow(null), 420);
        }
      } else {
        fx.sfx(() => sfxClick());
      }
      const merged = r.merges.map((m) => m.value).join(', ');
      let line = `${DIR_TEXT[dir]}.${merged ? ` Birleşti: ${merged}.` : ''} Puan ${sim.score}.`;
      if (!crossedRef.current && sim.score >= threshold) {
        crossedRef.current = true;
        fx.sfx(() => sfxWin());
        fx.haptic('success');
        fx.confetti('sides');
        shake(4);
        line += ` Ödül eşiği ${threshold} geçildi!`;
      } else if (r.milestone) {
        fx.sfx(() => sfxFanfare());
        fx.haptic('success');
        if (r.milestone >= 512) fx.confetti('sides');
        shake(r.milestone >= 512 ? 5 : 3);
        line += ` Yeni karo: ${r.milestone}!`;
      }
      setAnnounce(line);
      if (sim.over) {
        fx.sfx(() => sfxHit());
        fx.haptic('big');
        shake(6);
        window.setTimeout(() => endRun('stuck'), reduce ? 0 : 450);
      }
      return true;
    },
    [sim, persist, reduce, fx, threshold, shake, endRun]
  );

  /** Girdi: hazırsa uygula, değilse tek elemanlı tampona al (hızlı oyuncunun hamlesi yutulmaz). */
  const queue = useCallback(
    (dir: Dir) => {
      if (stage !== 'playing' || paused || sim.over) return;
      if (sim.ready()) applyMove(dir);
      else bufferRef.current = dir;
    },
    [stage, paused, sim, applyMove]
  );

  useGameLoop({
    active: playing,
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      if (sim.over) return;
      sim.step();
      const b = bufferRef.current;
      if (b !== null && sim.ready()) {
        bufferRef.current = null;
        applyMove(b);
      }
    },
    render: () => {},
  });

  useEffect(() => () => window.clearTimeout(ghostTimer.current), []);
  useEffect(() => {
    if (paused) bufferRef.current = null;
  }, [paused]);

  useGameInput(boardRef, {
    active: playing,
    keymap: KEYMAP,
    swipe: true,
    swipeThreshold: 20,
    pointer: false,
    onInput: (e) => {
      if (e.type === 'swipe') {
        queue(ACTION_DIR[e.direction]!);
        return;
      }
      if (e.type !== 'press') return;
      if (e.action === 'pause') {
        onPauseRequest();
        return;
      }
      const d = ACTION_DIR[e.action];
      if (d && !e.repeat) queue(d);
    },
  });

  // Periyodik kayıt (tick ilerlesin diye; hamle anında da yazılır).
  useEffect(() => {
    if (!playing || mode !== 'ranked') return;
    const id = window.setInterval(persist, 5000);
    return () => window.clearInterval(id);
  }, [playing, mode, persist]);

  // "Bitir": basılı tut ve onayla (yanlış dokunuşla günün hakkı yanmasın).
  const [hold, setHold] = useState(0);
  const holdRef = useRef<{ start: number; raf: number } | null>(null);
  const cancelHold = () => {
    if (holdRef.current) cancelAnimationFrame(holdRef.current.raf);
    holdRef.current = null;
    setHold(0);
  };
  const startHold = () => {
    if (stage !== 'playing' || paused || sim.moves === 0) return;
    const start = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        holdRef.current = null;
        setHold(0);
        if (sim.bank()) {
          recRef.current.record(sim.tick, CODE_BANK);
          endRun('bank');
        }
        return;
      }
      holdRef.current = { start, raf: requestAnimationFrame(tick) };
    };
    holdRef.current = { start, raf: requestAnimationFrame(tick) };
  };
  useEffect(() => () => cancelHold(), []);

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

  useEffect(() => {
    if (stage === 'playing') boardRef.current?.focus();
  }, [stage]);

  const startFromTutorial = () => {
    writeStore('local', TUTORIAL_KEY, '1');
    setStage('playing');
  };

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    if (!summary) return;
    const url = `${window.location.origin}/customer/games/trust-merge`;
    const text = `Qratex Güven Birleştir'de ${summary.score.toLocaleString('tr-TR')} puan yaptım, en yüksek karom ${summary.maxTile}! Sen geçebilir misin?`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Güven Birleştir', text, url });
        setShareNote('Paylaşıldı.');
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareNote('Panoya kopyalandı.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setShareNote('Paylaşılamadı; tarayıcın bu özelliği desteklemiyor olabilir.');
    }
  };

  const progress = Math.min(1, hud.score / Math.max(1, threshold));
  const fmt = (n: number) => n.toLocaleString('tr-TR');

  // Ekran okuyucu tahtası (görsel tahtanın metin karşılığı).
  const grid = useMemo(() => {
    const cells: number[] = new Array(SIZE * SIZE).fill(0);
    for (const t of tiles) if (t.kind !== 'ghost') cells[t.cell] = t.value;
    return cells;
  }, [tiles]);

  const transition = reduce ? 'none' : `transform ${SLIDE_MS}ms ease-out`;
  const pos = (cell: number) => {
    const r = Math.floor(cell / SIZE);
    const c = cell % SIZE;
    return `translate(calc(${c} * (100% + var(--tm-gap))), calc(${r} * (100% + var(--tm-gap))))`;
  };

  const dpad = (dir: Dir, label: string, Icon: typeof ArrowUp) => (
    <button
      type="button"
      aria-label={`${label} kaydır`}
      onPointerDown={(e) => {
        e.preventDefault();
        queue(dir);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          queue(dir);
        }
      }}
      className="flex h-14 w-14 touch-manipulation items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white active:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[440px] select-none">
      <style>{`
        @keyframes tm-pop { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.14); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes tm-spawn { 0% { transform: scale(0); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
        @keyframes tm-glow { 0% { box-shadow: 0 0 0 0 rgba(251,191,36,.75) } 100% { box-shadow: 0 0 0 14px rgba(251,191,36,0) } }
        .tm-pop { animation: tm-pop 180ms ease-out ${SLIDE_MS}ms both }
        .tm-spawn { animation: tm-spawn 140ms ease-out ${SLIDE_MS + 20}ms both }
        .tm-glow { animation: tm-glow 420ms ease-out both }
        @media (prefers-reduced-motion: reduce) { .tm-pop, .tm-spawn, .tm-glow { animation: none } }
      `}</style>

      {/* HUD: etiketli istatistikler + eşiğe ilerleme + Bitir (D-pad'den uzakta, üstte). */}
      <div className="mb-2 flex items-stretch gap-2 text-white">
        <dl className="grid flex-1 grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Puan</dt>
            <dd className="text-lg font-black tabular-nums leading-tight">{fmt(hud.score)}</dd>
          </div>
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">En iyi karo</dt>
            <dd className="text-lg font-black tabular-nums leading-tight">{hud.maxTile}</dd>
          </div>
          <div className="rounded-xl bg-white/10 px-1 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Hamle</dt>
            <dd className="text-lg font-black tabular-nums leading-tight">{hud.moves}</dd>
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

      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div
            className="h-2 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Ödül eşiğine ilerleme"
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Math.min(hud.score, threshold)}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progress * 100}%`, background: progress >= 1 ? '#3fa796' : accent }}
            />
          </div>
          <p className="mt-1 text-xs text-white/70">
            {hud.score >= threshold
              ? 'Ödül eşiği geçildi — devam et ya da basılı tutarak bitir.'
              : `Ödül eşiği ${fmt(threshold)} puan · ${fmt(threshold - hud.score)} kaldı`}
          </p>
        </div>
        {playing && hud.moves > 0 && (
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
              hud.score >= threshold
                ? 'Oyunu bitir ve sonucu kaydet. Onay için basılı tut.'
                : 'Oyunu bitir. Ödül eşiğine ulaşmadın; onay için basılı tut.'
            }
            className="relative flex h-11 shrink-0 touch-manipulation items-center gap-1.5 overflow-hidden rounded-xl border border-white/20 px-3 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-white/25"
              style={{ width: `${hold * 100}%` }}
            />
            <Flag className="relative h-4 w-4" aria-hidden />
            <span className="relative">{hold > 0 ? 'Bırakma…' : 'Bitir (basılı tut)'}</span>
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p id="tm-rules" className="sr-only">
        Aynı sayılı karoları kaydırıp birleştir. Ok tuşları ya da WASD ile kaydır, dokunmatikte parmağını kaydır. Esc
        duraklatır. Puan {hud.score}, en yüksek karo {hud.maxTile}.
      </p>

      <div ref={shakeRef}>
        <div
          ref={boardRef}
          tabIndex={0}
          role="application"
          aria-label="Güven Birleştir tahtası, 4'e 4"
          aria-describedby="tm-rules"
          className="relative aspect-square w-full touch-none overflow-hidden rounded-2xl bg-[#3a3226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          style={{ ['--tm-gap' as string]: '3%' } as CSSProperties}
        >
          {/* Arka plan hücreleri ve karolar AYNI konum formülünü kullanır (hizasızlık yok). */}
          <div className="absolute" style={{ inset: 'var(--tm-gap)' }}>
            {Array.from({ length: SIZE * SIZE }, (_, cell) => (
              <div
                key={cell}
                className="absolute left-0 top-0 rounded-lg bg-white/10"
                style={{
                  width: 'calc((100% - 3 * var(--tm-gap)) / 4)',
                  height: 'calc((100% - 3 * var(--tm-gap)) / 4)',
                  transform: pos(cell),
                }}
              />
            ))}
            {tiles.map((t) => {
              const st = tileStyle(t.value);
              const digits = String(t.value).length;
              return (
                <div
                  key={t.id}
                  aria-hidden
                  className="absolute left-0 top-0"
                  style={{
                    width: 'calc((100% - 3 * var(--tm-gap)) / 4)',
                    height: 'calc((100% - 3 * var(--tm-gap)) / 4)',
                    transform: pos(t.cell),
                    transition,
                    zIndex: t.kind === 'ghost' ? 1 : t.kind === 'merged' ? 3 : 2,
                  }}
                >
                  <div
                    className={[
                      'flex h-full w-full items-center justify-center rounded-lg font-black tabular-nums',
                      t.kind === 'merged' && !reduce ? 'tm-pop' : '',
                      t.kind === 'spawn' && !reduce ? 'tm-spawn' : '',
                      glow === t.cell && t.kind === 'merged' && !reduce ? 'tm-glow' : '',
                    ].join(' ')}
                    style={{
                      background: st.bg,
                      color: st.fg,
                      fontSize: digits <= 2 ? 'clamp(22px, 8vw, 36px)' : digits === 3 ? 'clamp(18px, 6.5vw, 30px)' : 'clamp(14px, 5vw, 24px)',
                      boxShadow: t.value >= 128 ? `0 0 0 2px ${st.fg}33 inset` : undefined,
                    }}
                  >
                    {t.value}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Metin karşılığı (görsel tahtayla eş; ekran okuyucu için). */}
          <table className="sr-only">
            <caption>Tahta durumu</caption>
            <tbody>
              {Array.from({ length: SIZE }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: SIZE }, (_, c) => {
                    const v = grid[r * SIZE + c];
                    return <td key={c}>{v ? v : 'boş'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {stage === 'tutorial' && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="tm-tut-title"
              className="absolute inset-0 z-10 flex flex-col justify-center gap-3 overflow-y-auto bg-[#1c1710]/95 p-5 text-white"
            >
              <h3 id="tm-tut-title" className="text-center text-xl font-bold">
                Nasıl oynanır?
              </h3>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                  <span>
                    <b>Kaydır:</b> tüm karolar o yöne kayar. Her hamleden sonra boş bir yere 2 ya da 4 doğar.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                  <span>
                    <b>Aynı iki karo birleşir:</b> 8 + 8 → 16 ve <b>16 puan</b> kazanırsın. Puanın birleşimlerin
                    toplamıdır.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                  <span>
                    <b>Ödül eşiği {fmt(threshold)} puan</b> (yaklaşık 256 karosu). Eşikten sonra devam edip yıldız
                    topla; istediğinde “Bitir”e basılı tut.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Star className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                  <span>
                    <b>İpucu:</b> en büyük karoyu bir köşede tut. İlerledikçe 4 doğma olasılığı artar.
                  </span>
                </li>
              </ol>
              <p className="text-center text-xs text-white/70">
                {coarse ? 'Tahtada parmağını kaydır ya da yön düğmelerini kullan.' : 'Ok tuşları / WASD · Esc duraklat'}
              </p>
              <button
                type="button"
                autoFocus
                onClick={startFromTutorial}
                className="mx-auto h-12 rounded-xl px-8 font-bold text-[#1c1710] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ background: '#e9c349' }}
              >
                Anladım, başla
              </button>
            </div>
          )}

          {stage === 'summary' && summary && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="tm-sum-title"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 overflow-y-auto bg-[#1c1710]/95 p-5 text-center text-white"
            >
              <h3 id="tm-sum-title" className="text-xl font-bold">
                {summary.reason === 'bank' ? 'Oyunu bitirdin' : 'Hamle kalmadı'}
              </h3>
              <div className="flex gap-1" role="img" aria-label={`3 yıldızdan ${summary.stars}`}>
                {[1, 2, 3].map((n) => (
                  <Star
                    key={n}
                    className="h-9 w-9"
                    aria-hidden
                    style={{ color: n <= summary.stars ? '#e9c349' : 'rgba(255,255,255,0.25)' }}
                    fill={n <= summary.stars ? '#e9c349' : 'none'}
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
              <dl className="grid w-full max-w-xs grid-cols-2 gap-2 text-xs">
                {[
                  ['En yüksek karo', String(summary.maxTile)],
                  ['Hamle', String(summary.moves)],
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
                    ? 'Ödül eşiğini geçtin — sunucu hamlelerini yeniden oynatıp doğruladıktan sonra ödül hesaplanır.'
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
                  className="flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#1c1710] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  style={{ background: '#e9c349' }}
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

      {coarse && stage === 'playing' && (
        <div className="mt-3 grid grid-cols-3 justify-items-center gap-2" role="group" aria-label="Yön düğmeleri">
          <span />
          {dpad(DIR.UP, 'Yukarı', ArrowUp)}
          <span />
          {dpad(DIR.LEFT, 'Sola', ArrowLeft)}
          {dpad(DIR.DOWN, 'Aşağı', ArrowDown)}
          {dpad(DIR.RIGHT, 'Sağa', ArrowRight)}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-white/70">
        {boot.resumed && stage === 'playing' ? 'Kaldığın yerden devam ediyorsun. · ' : ''}
        {mode === 'practice'
          ? 'Pratik: ödülsüz, liderliğe girmez.'
          : 'Sıralı: hamlelerin sunucuda yeniden oynatılarak doğrulanır.'}
      </p>
    </div>
  );
}
