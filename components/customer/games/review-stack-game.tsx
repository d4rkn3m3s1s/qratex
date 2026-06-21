'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, Zap } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxWin, sfxPowerUp, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('review-stack')!;
const COLS = 9;
const ROWS = 16;
const CELL = 22;
const W = COLS * CELL;
const H = ROWS * CELL;
const DROP_MS = 620;

function reducedMotion() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-animations');
}

// Tetromino şekilleri (her biri 4 hücre) + tema rengi
type Shape = number[][];
const PIECES: { cells: Shape; color: string }[] = [
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: '#22d3ee' }, // I
  { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: '#fbbf24' }, // O
  { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: '#a855f7' }, // T
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#3b82f6' }, // J
  { cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: '#f97316' }, // L
  { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#34d399' }, // S
  { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: '#f43f5e' }, // Z
];

type Cell = { c: number; r: number };
interface Active {
  cells: Cell[];
  color: string;
}

function rotate(active: Active): Cell[] {
  // pivot = ilk hücre etrafında 90° saat yönü: (c,r) -> (-r, c)
  const px = active.cells[0].c;
  const py = active.cells[0].r;
  return active.cells.map((cell) => ({
    c: px - (cell.r - py),
    r: py + (cell.c - px),
  }));
}

export function ReviewStackGame() {
  const game = useMiniGame('review-stack');
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [retry, setRetry] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<(string | null)[][]>([]);
  const activeRef = useRef<Active | null>(null);
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastDropRef = useRef(0);
  const flashRef = useRef<{ rows: number[]; t: number } | null>(null);
  const groundedRef = useRef(false); // lock-delay: yere değdi mi (bir tur grace)

  const playing = game.phase === 'playing';

  const endGame = useCallback(
    (won: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      runningRef.current = false;
      if (won) sfxWin();
      else sfxHit();
      void game.finish(scoreRef.current, won);
    },
    [game]
  );

  const collides = useCallback((cells: Cell[]) => {
    const g = gridRef.current;
    return cells.some(
      (c) => c.c < 0 || c.c >= COLS || c.r >= ROWS || (c.r >= 0 && g[c.r] && g[c.r][c.c])
    );
  }, []);

  const spawn = useCallback(() => {
    const p = PIECES[Math.floor(Math.random() * PIECES.length)];
    const offset = Math.floor((COLS - 3) / 2);
    const cells = p.cells.map(([c, r]) => ({ c: c + offset, r: r - 1 }));
    const a: Active = { cells, color: p.color };
    if (collides(a.cells.map((c) => ({ c: c.c, r: c.r + 1 })))) {
      // tepeye ulaştı
      endGame(scoreRef.current >= DEF.rewardThreshold);
      return;
    }
    activeRef.current = a;
  }, [collides, endGame]);

  const lockAndClear = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const g = gridRef.current;
    a.cells.forEach((c) => {
      if (c.r >= 0 && c.r < ROWS) g[c.r][c.c] = a.color;
    });
    sfxPowerUp();
    haptic(6);
    // dolu satırları bul
    const full: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (g[r].every((v) => v !== null)) full.push(r);
    }
    if (full.length > 0) {
      const gain = full.length * full.length; // 1,4,9,16
      scoreRef.current += gain;
      linesRef.current += full.length;
      setScore(scoreRef.current);
      setLines(linesRef.current);
      flashRef.current = { rows: full, t: 1 };
      if (full.length >= 2) {
        sfxFanfare();
        sfxBoom();
        haptic([10, 20, 10]);
      } else {
        sfxCollectStar(scoreRef.current % 6);
        haptic([8, 12]);
      }
      if (reducedMotion() === false) {
        const arena = canvasRef.current?.parentElement;
        if (arena) {
          arena.animate(
            [{ transform: 'translate(0,0)' }, { transform: `translate(0,${full.length * 2}px)` }, { transform: 'translate(0,0)' }],
            { duration: 160 }
          );
        }
      }
      // satırları kaldır
      const kept = g.filter((_, r) => !full.includes(r));
      const empty: (string | null)[][] = Array.from({ length: full.length }, () => Array(COLS).fill(null));
      gridRef.current = [...empty, ...kept];
      if (scoreRef.current >= DEF.maxScore) {
        endGame(true);
        return;
      }
    }
    spawn();
  }, [endGame, spawn]);

  const move = useCallback(
    (dc: number) => {
      const a = activeRef.current;
      if (!a || !runningRef.current) return;
      const next = a.cells.map((c) => ({ c: c.c + dc, r: c.r }));
      if (!collides(next)) {
        activeRef.current = { ...a, cells: next };
        groundedRef.current = false; // hareketle lock-delay'i tazele
      }
    },
    [collides]
  );

  // Manuel "aşağı": oyuncu bilerek bastıysa hemen bir kademe iner (yere değdiyse kilitlenir).
  const softDrop = useCallback(() => {
    const a = activeRef.current;
    if (!a || !runningRef.current) return false;
    const next = a.cells.map((c) => ({ c: c.c, r: c.r + 1 }));
    if (collides(next)) {
      lockAndClear();
      return true;
    }
    activeRef.current = { ...a, cells: next };
    groundedRef.current = false;
    return false;
  }, [collides, lockAndClear]);

  // Yerçekimi adımı (otomatik): yere değdiyse bir tur "lock delay" tanı —
  // oyuncu kaydırıp/döndürüp düzeltebilsin, twitch-kilit olmasın.
  const gravityStep = useCallback(() => {
    const a = activeRef.current;
    if (!a || !runningRef.current) return;
    const next = a.cells.map((c) => ({ c: c.c, r: c.r + 1 }));
    if (collides(next)) {
      if (groundedRef.current) {
        groundedRef.current = false;
        lockAndClear();
      } else {
        groundedRef.current = true; // bu tur kilitleme, bir şans daha ver
      }
      return;
    }
    activeRef.current = { ...a, cells: next };
    groundedRef.current = false;
  }, [collides, lockAndClear]);

  const hardDrop = useCallback(() => {
    const a = activeRef.current;
    if (!a || !runningRef.current) return;
    let cells = a.cells;
    while (!collides(cells.map((c) => ({ c: c.c, r: c.r + 1 })))) {
      cells = cells.map((c) => ({ c: c.c, r: c.r + 1 }));
    }
    activeRef.current = { ...a, cells };
    lastDropRef.current = 0;
    lockAndClear();
  }, [collides, lockAndClear]);

  const doRotate = useCallback(() => {
    const a = activeRef.current;
    if (!a || !runningRef.current) return;
    const rotated = rotate(a);
    // duvar itmesi (wall kick)
    for (const dx of [0, -1, 1, -2, 2]) {
      const shifted = rotated.map((c) => ({ c: c.c + dx, r: c.r }));
      if (!collides(shifted)) {
        activeRef.current = { ...a, cells: shifted };
        groundedRef.current = false; // döndürmeyle lock-delay'i tazele
        sfxCollectStar(2);
        return;
      }
    }
  }, [collides]);

  // klavye
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(k)) e.preventDefault();
      if (k === 'ArrowLeft' || k === 'a') move(-1);
      else if (k === 'ArrowRight' || k === 'd') move(1);
      else if (k === 'ArrowDown' || k === 's') softDrop();
      else if (k === 'ArrowUp' || k === 'w') doRotate();
      else if (k === ' ') hardDrop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, move, softDrop, doRotate, hardDrop]);

  useEffect(() => {
    if (!playing) return;
    let mountRaf = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      mountRaf = requestAnimationFrame(() => setRetry((r) => r + 1));
      return () => cancelAnimationFrame(mountRaf);
    }

    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = 0;
    linesRef.current = 0;
    setScore(0);
    setLines(0);
    gridRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    flashRef.current = null;
    lastDropRef.current = 0;
    groundedRef.current = false;
    spawn();

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#060d1c';
      ctx.fillRect(0, 0, W, H);
      // grid çizgileri
      ctx.strokeStyle = 'rgba(59,130,246,0.06)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL, 0);
        ctx.lineTo(c * CELL, H);
        ctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL);
        ctx.lineTo(W, r * CELL);
        ctx.stroke();
      }

      const block = (c: number, r: number, color: string, alpha = 1) => {
        if (r < 0) return;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillRect(c * CELL + 1.5, r * CELL + 1.5, CELL - 3, CELL - 3);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(c * CELL + 1.5, r * CELL + 1.5, CELL - 3, 4);
        ctx.globalAlpha = 1;
      };

      // yerleşmiş bloklar
      const g = gridRef.current;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (g[r][c]) block(c, r, g[r][c]!);
        }
      }

      // hayalet (gölge)
      const a = activeRef.current;
      if (a) {
        let ghost = a.cells;
        while (!collides(ghost.map((c) => ({ c: c.c, r: c.r + 1 })))) {
          ghost = ghost.map((c) => ({ c: c.c, r: c.r + 1 }));
        }
        ghost.forEach((c) => block(c.c, c.r, a.color, 0.18));
        a.cells.forEach((c) => block(c.c, c.r, a.color));
      }

      // satır temizleme flaşı
      if (flashRef.current) {
        const f = flashRef.current;
        ctx.globalAlpha = f.t;
        ctx.fillStyle = '#fff';
        f.rows.forEach((r) => ctx.fillRect(0, r * CELL, W, CELL));
        ctx.globalAlpha = 1;
        f.t -= 0.12;
        if (f.t <= 0) flashRef.current = null;
      }
    };

    const loop = (ts: number) => {
      if (!runningRef.current) return;
      if (ts - lastDropRef.current >= DROP_MS) {
        lastDropRef.current = ts;
        gravityStep();
        if (!runningRef.current) return;
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, retry]);

  return (
    <GameShell
      title={DEF.title}
      emoji={DEF.emoji}
      description={DEF.description}
      accent={DEF.accent}
      phase={game.phase}
      alreadyPlayed={game.alreadyPlayed}
      result={game.result}
      rewardThreshold={DEF.rewardThreshold}
      gameType={DEF.gameType}
      onStart={game.start}
      copy={getGameCopy(DEF.gameType)}
    >
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
          <Zap className="h-4 w-4" /> {score}
        </div>
        <div className="text-xs text-white/60">Hedef: {DEF.rewardThreshold}</div>
        <div className="flex items-center gap-1.5 text-blue-300">
          <Layers className="h-4 w-4" /> {lines} satır
        </div>
      </div>

      <div
        className="relative mx-auto flex w-full flex-col items-center gap-3 overflow-hidden rounded-2xl p-3"
        style={{ background: 'radial-gradient(circle at 50% 25%, #0b1733 0%, #060d1c 55%, #03060f 85%)' }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="max-w-full touch-none rounded-xl"
          style={{ boxShadow: `0 0 28px ${DEF.accent}33` }}
        />

        {/* Mobil kontroller */}
        <div className="grid w-full max-w-[260px] grid-cols-4 gap-1.5 sm:hidden">
          <Ctrl label="◀" onTap={() => move(-1)} accent={DEF.accent} />
          <Ctrl label="↻" onTap={doRotate} accent={DEF.accent} />
          <Ctrl label="▼" onTap={() => softDrop()} accent={DEF.accent} />
          <Ctrl label="▶" onTap={() => move(1)} accent={DEF.accent} />
          <button
            type="button"
            onClick={hardDrop}
            className="col-span-4 rounded-xl border py-2 text-xs font-bold text-white active:scale-95"
            style={{ borderColor: `${DEF.accent}55`, background: `${DEF.accent}1a` }}
          >
            ⏬ Sert Düşür
          </button>
        </div>
        <p className="text-center text-[10px] text-white/40">⌨️ Oklar: hareket · ↑ döndür · Boşluk: sert düşür · {DEF.rewardThreshold}+ = ödül</p>
      </div>
    </GameShell>
  );
}

function Ctrl({ label, onTap, accent }: { label: string; onTap: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex h-12 items-center justify-center rounded-xl border text-lg font-bold text-white active:scale-90"
      style={{ borderColor: `${accent}55`, background: `${accent}1a` }}
    >
      {label}
    </button>
  );
}
