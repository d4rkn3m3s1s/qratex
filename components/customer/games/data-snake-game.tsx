'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Zap, Gauge } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxWin, sfxFanfare, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('data-snake')!;
const COLS = 17;
const ROWS = 17;
const CELL = 19;
const W = COLS * CELL;
const H = ROWS * CELL;
const BASE_STEP_MS = 140;
const MIN_STEP_MS = 70;

type Pt = { x: number; y: number };
type Dir = 'up' | 'down' | 'left' | 'right';
const DELTA: Record<Dir, Pt> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function reducedMotion() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-animations');
}

export function DataSnakeGame() {
  const game = useMiniGame('data-snake');
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [retry, setRetry] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snakeRef = useRef<Pt[]>([]);
  const dirRef = useRef<Dir>('right');
  const queueRef = useRef<Dir[]>([]);
  const foodRef = useRef<Pt>({ x: 8, y: 8 });
  const scoreRef = useRef(0);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastStepRef = useRef(0);
  const popRef = useRef<{ x: number; y: number; t: number } | null>(null);

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

  const placeFood = useCallback(() => {
    const occupied = new Set(snakeRef.current.map((s) => `${s.x},${s.y}`));
    let p: Pt;
    do {
      p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (occupied.has(`${p.x},${p.y}`));
    foodRef.current = p;
  }, []);

  const turn = useCallback((d: Dir) => {
    if (!runningRef.current) return;
    const lastQueued = queueRef.current.length > 0 ? queueRef.current[queueRef.current.length - 1] : dirRef.current;
    if (d === lastQueued || d === OPPOSITE[lastQueued]) return;
    if (queueRef.current.length < 3) queueRef.current.push(d);
  }, []);

  // Klavye kontrolü
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
      };
      const d = map[e.key];
      if (d) {
        e.preventDefault();
        turn(d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, turn]);

  // Dokunmatik swipe
  useEffect(() => {
    if (!playing) return;
    const el = canvasRef.current;
    if (!el) return;
    let sx = 0, sy = 0;
    const onStart = (e: TouchEvent) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 'right' : 'left');
      else turn(dy > 0 ? 'down' : 'up');
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [playing, turn]);

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
    setScore(0);
    setSpeed(1);
    snakeRef.current = [
      { x: 5, y: 8 },
      { x: 4, y: 8 },
      { x: 3, y: 8 },
    ];
    dirRef.current = 'right';
    queueRef.current = [];
    lastStepRef.current = 0;
    popRef.current = null;
    placeFood();

    const stepMs = () => Math.max(MIN_STEP_MS, BASE_STEP_MS - scoreRef.current * 4);

    const step = () => {
      // yön kuyruğundan bir sonraki geçerli yönü al
      if (queueRef.current.length > 0) {
        const nd = queueRef.current.shift()!;
        if (nd !== OPPOSITE[dirRef.current]) dirRef.current = nd;
      }
      const d = DELTA[dirRef.current];
      const head = snakeRef.current[0];
      const nx = head.x + d.x;
      const ny = head.y + d.y;

      // duvar / kendine çarpma
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        sfxHit();
        haptic([30, 50]);
        endGame(scoreRef.current >= DEF.rewardThreshold);
        return;
      }
      if (snakeRef.current.some((s, i) => i < snakeRef.current.length - 1 && s.x === nx && s.y === ny)) {
        sfxHit();
        haptic([30, 50]);
        endGame(scoreRef.current >= DEF.rewardThreshold);
        return;
      }

      const ate = nx === foodRef.current.x && ny === foodRef.current.y;
      snakeRef.current.unshift({ x: nx, y: ny });
      if (ate) {
        scoreRef.current += 1;
        setScore(scoreRef.current);
        setSpeed(Math.round((BASE_STEP_MS / stepMs()) * 10) / 10);
        popRef.current = { x: nx, y: ny, t: 1 };
        const milestone = scoreRef.current % 5 === 0;
        sfxCollectStar(scoreRef.current % 6);
        haptic(milestone ? [10, 20] : 8);
        if (milestone) {
          sfxFanfare();
          if (!reducedMotion()) {
            // hafif ekran sarsıntısı
            const arena = canvas.parentElement;
            if (arena) {
              arena.animate(
                [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }],
                { duration: 180 }
              );
            }
          }
        }
        if (scoreRef.current >= DEF.maxScore) {
          draw();
          endGame(true);
          return;
        }
        placeFood();
      } else {
        snakeRef.current.pop();
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // arka plan grid
      ctx.fillStyle = '#04130d';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(16,185,129,0.07)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, H);
        ctx.stroke();
      }
      for (let j = 0; j <= ROWS; j++) {
        ctx.beginPath();
        ctx.moveTo(0, j * CELL);
        ctx.lineTo(W, j * CELL);
        ctx.stroke();
      }

      // yem (veri paketi)
      const f = foodRef.current;
      const pulse = (Math.sin(lastStepRef.current / 120) + 1) / 2;
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 14 + pulse * 8;
      const fp = CELL * 0.22;
      roundRect(ctx, f.x * CELL + fp, f.y * CELL + fp, CELL - fp * 2, CELL - fp * 2, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // yılan
      const snake = snakeRef.current;
      for (let i = snake.length - 1; i >= 0; i--) {
        const s = snake[i];
        const head = i === 0;
        const tint = 1 - i / (snake.length + 4);
        ctx.fillStyle = head ? '#6ee7b7' : `rgba(16,185,129,${0.45 + tint * 0.5})`;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = head ? 16 : 6;
        const pad = head ? 1.5 : 2.5;
        roundRect(ctx, s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, head ? 6 : 4);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (head) {
          // gözler
          ctx.fillStyle = '#04130d';
          const ex = s.x * CELL + CELL / 2;
          const ey = s.y * CELL + CELL / 2;
          ctx.beginPath();
          ctx.arc(ex - 3, ey - 2, 2, 0, Math.PI * 2);
          ctx.arc(ex + 3, ey - 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // yeme pop efekti
      if (popRef.current) {
        const p = popRef.current;
        ctx.globalAlpha = p.t;
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, (1 - p.t) * 22 + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        p.t -= 0.06;
        if (p.t <= 0) popRef.current = null;
      }
    };

    const loop = (ts: number) => {
      if (!runningRef.current) return;
      if (ts - lastStepRef.current >= stepMs()) {
        lastStepRef.current = ts;
        step();
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
        <div className="flex items-center gap-1.5 text-emerald-300">
          <Gauge className="h-4 w-4" /> {speed.toFixed(1)}x
        </div>
      </div>

      <div
        className="relative mx-auto flex w-full flex-col items-center gap-3 overflow-hidden rounded-2xl p-3"
        style={{ background: 'radial-gradient(circle at 50% 30%, #062a1c 0%, #04130d 55%, #020a06 85%)' }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="max-w-full touch-none rounded-xl"
          style={{ boxShadow: `0 0 30px ${DEF.accent}33` }}
        />

        {/* Mobil D-pad */}
        <div className="grid grid-cols-3 gap-1.5 sm:hidden" style={{ width: 168 }}>
          <span />
          <DPad label="▲" onTap={() => turn('up')} accent={DEF.accent} />
          <span />
          <DPad label="◀" onTap={() => turn('left')} accent={DEF.accent} />
          <DPad label="▼" onTap={() => turn('down')} accent={DEF.accent} />
          <DPad label="▶" onTap={() => turn('right')} accent={DEF.accent} />
        </div>
        <p className="text-center text-[10px] text-white/40">⌨️ Ok tuşları / WASD · 📱 kaydır veya D-pad · {DEF.rewardThreshold}+ paket = ödül</p>
      </div>
    </GameShell>
  );
}

function DPad({ label, onTap, accent }: { label: string; onTap: () => void; accent: string }) {
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
