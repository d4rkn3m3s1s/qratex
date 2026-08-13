'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Zap, Hash } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxHit, sfxPowerUp, sfxWin, sfxCombo, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('speed-order')!;
const ROUND_MS = 45_000;
const ARENA_H = 420;

interface Cell {
  id: number;
  n: number;
  x: number; // %
  y: number; // %
}

let _seq = 0;
function buildBoard(count: number): Cell[] {
  const slots: { x: number; y: number }[] = [];
  // grid noktaları + jitter
  const cols = 3;
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    slots.push({
      x: 18 + c * 32 + (Math.random() * 10 - 5),
      y: 14 + r * (66 / Math.max(1, rows - 1 || 1)) + (Math.random() * 8 - 4),
    });
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return Array.from({ length: count }, (_, i) => ({ id: ++_seq, n: i + 1, x: slots[i].x, y: slots[i].y }));
}

export function SpeedOrderGame() {
  const game = useMiniGame('speed-order');
  const [cells, setCells] = useState<Cell[]>([]);
  const [next, setNext] = useState(1);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));

  const scoreRef = useRef(0);
  const nextRef = useRef(1);
  const roundRef = useRef(0);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<FxHandle>(null);

  const playing = game.phase === 'playing';

  const toPx = useCallback((xPct: number, yPct: number) => {
    const el = arenaRef.current;
    if (!el) return { x: 0, y: 0 };
    return { x: (xPct / 100) * el.clientWidth, y: (yPct / 100) * el.clientHeight };
  }, []);

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

  const startRound = useCallback(() => {
    roundRef.current += 1;
    setRound(roundRef.current);
    const count = Math.min(9, 4 + roundRef.current); // her turda artar
    nextRef.current = 1;
    setNext(1);
    setCells(buildBoard(count));
    sfxPowerUp();
  }, []);

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = 0;
    roundRef.current = 0;
    setScore(0);
    startRound();
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setTimeLeft(Math.max(0, Math.round((ROUND_MS - elapsed) / 1000)));
      if (elapsed >= ROUND_MS) {
        clearInterval(tick);
        endGame(scoreRef.current >= DEF.rewardThreshold);
      }
    }, 250);
    return () => {
      clearInterval(tick);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const tap = useCallback(
    (cell: Cell) => {
      if (!runningRef.current) return;
      const p = toPx(cell.x, cell.y);
      if (cell.n === nextRef.current) {
        setCells((prev) => prev.filter((c) => c.id !== cell.id));
        sfxCombo(cell.n);
        haptic(6);
        fxRef.current?.burst(p.x, p.y, DEF.accent, 18);
        fxRef.current?.ring(p.x, p.y, DEF.accent);
        nextRef.current += 1;
        setNext(nextRef.current);
        // tur tamamlandı mı?
        setCells((prev) => {
          if (prev.length === 0) {
            scoreRef.current += 1;
            setScore(scoreRef.current);
            sfxFanfare();
            haptic([10, 20]);
            fxRef.current?.shockwave(p.x, p.y, DEF.accent, 160);
            fxRef.current?.confettiAt(p.x, p.y, ['#22d3ee', '#67e8f9', '#fbbf24'], 16);
            fxRef.current?.floatText(p.x, p.y, 'Tur tamam! +1', '#67e8f9');
            if (scoreRef.current >= DEF.maxScore) {
              setTimeout(() => endGame(true), 300);
            } else {
              setTimeout(startRound, 400);
            }
          }
          return prev;
        });
      } else {
        // yanlış sıra → ceza: sıra başa döner (aynı tur), küçük şok
        sfxBoom();
        haptic([20, 40]);
        fxRef.current?.burst(p.x, p.y, '#f43f5e', 14);
        fxRef.current?.shockwave(p.x, p.y, '#f43f5e', 130);
        fxRef.current?.floatText(p.x, p.y, 'Sıra yanlış!', '#fca5a5');
        nextRef.current = 1;
        setNext(1);
      }
    },
    [endGame, startRound, toPx]
  );

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
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs text-white/80">Tur {round}</div>
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
          <Hash className="h-4 w-4" /> Sıradaki: <span className="font-black">{next}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" style={{ color: DEF.accent }}><Zap className="h-4 w-4" /> {score}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</span>
        </div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl"
        style={{ height: ARENA_H, background: 'radial-gradient(circle at 50% 35%, #052e3a 0%, #02161c 55%, #03080d 85%)' }}
      >
        <AnimatePresence>
          {cells.map((c) => {
            const isNext = c.n === next;
            return (
              <Motion.button
                key={c.id}
                type="button"
                onClick={() => tap(c)}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                whileTap={{ scale: 0.85 }}
                className="absolute flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black"
                style={{
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  transform: 'translate(-50%, -50%)',
                  color: '#06141a',
                  background: isNext ? `linear-gradient(135deg, #fff, ${DEF.accent})` : `linear-gradient(135deg, ${DEF.accent}, ${DEF.accent}99)`,
                  boxShadow: isNext ? `0 0 26px ${DEF.accent}` : `0 0 12px ${DEF.accent}66`,
                }}
              >
                {c.n}
                {isNext && (
                  <Motion.span
                    className="absolute inset-0 rounded-2xl border-2 border-white"
                    animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                  />
                )}
              </Motion.button>
            );
          })}
        </AnimatePresence>
        <FxLayer ref={fxRef} />
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center text-[10px] text-white/40">
          1’den başla, sırayla dokun. Parlayan kutu = sıradaki!
        </div>
      </div>
    </GameShell>
  );
}
