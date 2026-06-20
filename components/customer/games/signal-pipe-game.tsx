'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Radio, Server, Zap } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { sfxCollectStar, sfxHit, sfxWin, sfxPowerUp, sfxFanfare, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('signal-pipe')!;
const SIZE = 5; // 5x5 ızgara

// Her hücre 4 yön bitmask: 1=üst 2=sağ 4=alt 8=sol
const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
type Cell = { mask: number; locked: boolean };

function rotateMask(mask: number): number {
  // saat yönü 90°: üst→sağ, sağ→alt, alt→sol, sol→üst
  let out = 0;
  if (mask & UP) out |= RIGHT;
  if (mask & RIGHT) out |= DOWN;
  if (mask & DOWN) out |= LEFT;
  if (mask & LEFT) out |= UP;
  return out;
}

const SRC_POS: [number, number] = [0, 0];
const DST_POS: [number, number] = [SIZE - 1, SIZE - 1];
const OPP: Record<number, number> = { [UP]: DOWN, [RIGHT]: LEFT, [DOWN]: UP, [LEFT]: RIGHT };
const DIRS = [UP, RIGHT, DOWN, LEFT];
const DXY: Record<number, [number, number]> = { [UP]: [0, -1], [RIGHT]: [1, 0], [DOWN]: [0, 1], [LEFT]: [-1, 0] };

// Kaynak (0,0) → hedef (SIZE-1,SIZE-1) garantili çözülebilir bir yol üret,
// sonra hücreleri rastgele döndürerek karıştır.
function buildLevel(): { grid: Cell[][]; src: [number, number]; dst: [number, number] } {
  const grid: Cell[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ mask: 0, locked: false }))
  );
  const src: [number, number] = [0, 0];
  const dst: [number, number] = [SIZE - 1, SIZE - 1];

  // basit rastgele yürüyüşle kaynaktan hedefe yol kur
  const visited = new Set<string>();
  const path: [number, number][] = [];
  let cur: [number, number] = [...src];
  visited.add(`${cur[0]},${cur[1]}`);
  path.push(cur);
  let guard = 0;
  while ((cur[0] !== dst[0] || cur[1] !== dst[1]) && guard++ < 500) {
    const [x, y] = cur;
    // hedefe doğru ağırlıklı yön seçimi
    const opts: [number, number][] = [];
    if (x < SIZE - 1) opts.push([x + 1, y]);
    if (y < SIZE - 1) opts.push([x, y + 1]);
    if (x > 0) opts.push([x - 1, y]);
    if (y > 0) opts.push([x, y - 1]);
    const fresh = opts.filter((o) => !visited.has(`${o[0]},${o[1]}`));
    const pick = (fresh.length ? fresh : opts)[Math.floor(Math.random() * (fresh.length ? fresh.length : opts.length))];
    // bağlantı maskelerini ekle
    const dx = pick[0] - x;
    const dy = pick[1] - y;
    const dir = dx === 1 ? RIGHT : dx === -1 ? LEFT : dy === 1 ? DOWN : UP;
    grid[y][x].mask |= dir;
    grid[pick[1]][pick[0]].mask |= OPP[dir];
    if (!visited.has(`${pick[0]},${pick[1]}`)) {
      visited.add(`${pick[0]},${pick[1]}`);
      path.push(pick);
    }
    cur = pick;
  }

  // birkaç dal ekle (görsel zenginlik + zorluk)
  for (let i = 0; i < SIZE; i++) {
    const [bx, by] = path[Math.floor(Math.random() * path.length)];
    const dir = DIRS[Math.floor(Math.random() * 4)];
    const [dx, dy] = DXY[dir];
    const nx = bx + dx;
    const ny = by + dy;
    if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
      grid[by][bx].mask |= dir;
      grid[ny][nx].mask |= OPP[dir];
    }
  }

  // her hücreyi rastgele 0-3 kez döndürerek karıştır
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const turns = Math.floor(Math.random() * 4);
      for (let t = 0; t < turns; t++) grid[y][x].mask = rotateMask(grid[y][x].mask);
    }
  return { grid, src, dst };
}

// Kaynaktan akan (enerjili) hücreleri BFS ile bul.
function computeFlow(grid: Cell[][], src: [number, number]): Set<string> {
  const flow = new Set<string>();
  const q: [number, number][] = [src];
  flow.add(`${src[0]},${src[1]}`);
  while (q.length) {
    const [x, y] = q.shift()!;
    const m = grid[y][x].mask;
    for (const dir of DIRS) {
      if (!(m & dir)) continue;
      const [dx, dy] = DXY[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
      const nm = grid[ny][nx].mask;
      if (!(nm & OPP[dir])) continue; // karşılıklı bağlı değil
      const key = `${nx},${ny}`;
      if (!flow.has(key)) {
        flow.add(key);
        q.push([nx, ny]);
      }
    }
  }
  return flow;
}

export function SignalPipeGame() {
  const game = useMiniGame('signal-pipe');
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [flow, setFlow] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState(0);
  const [taps, setTaps] = useState(0);

  const gridRef = useRef<Cell[][]>([]);
  const solvedRef = useRef(0);
  const tapsRef = useRef(0);
  const finishedRef = useRef(false);
  const lockRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<FxHandle>(null);

  const SRC = SRC_POS;
  const DST = DST_POS;
  const playing = game.phase === 'playing';

  const endGame = useCallback(
    (won: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (won) sfxWin();
      else sfxHit();
      void game.finish(solvedRef.current, won);
    },
    [game]
  );

  const loadLevel = useCallback(() => {
    const { grid: g } = buildLevel();
    gridRef.current = g;
    setGrid(g.map((row) => row.map((c) => ({ ...c }))));
    setFlow(computeFlow(g, SRC));
    setTaps(0);
    tapsRef.current = 0;
    lockRef.current = false;
  }, [SRC]);

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    solvedRef.current = 0;
    setSolved(0);
    loadLevel();
  }, [playing, loadLevel]);

  const rotateCell = useCallback(
    (x: number, y: number, e: React.MouseEvent) => {
      if (lockRef.current || finishedRef.current) return;
      const g = gridRef.current;
      g[y][x] = { ...g[y][x], mask: rotateMask(g[y][x].mask) };
      gridRef.current = g.map((row) => row.map((c) => ({ ...c })));
      tapsRef.current += 1;
      setTaps(tapsRef.current);
      setGrid(gridRef.current);
      sfxPowerUp();
      haptic(5);

      const newFlow = computeFlow(gridRef.current, SRC);
      setFlow(newFlow);

      // hedefe ulaştı mı?
      if (newFlow.has(`${DST[0]},${DST[1]}`)) {
        lockRef.current = true;
        solvedRef.current += 1;
        setSolved(solvedRef.current);
        sfxFanfare();
        sfxCollectStar(solvedRef.current % 6);
        haptic([10, 20, 10]);
        const rect = arenaRef.current?.getBoundingClientRect();
        const px = rect ? e.clientX - rect.left : 0;
        const py = rect ? e.clientY - rect.top : 0;
        fxRef.current?.shockwave(px, py, DEF.accent, 200);
        fxRef.current?.confettiAt(px, py, ['#06b6d4', '#22d3ee', '#67e8f9'], 22);
        if (solvedRef.current >= DEF.maxScore) {
          setTimeout(() => endGame(true), 600);
          return;
        }
        setTimeout(loadLevel, 700);
      }
    },
    [endGame, loadLevel, SRC, DST]
  );

  const giveUp = useCallback(() => {
    if (finishedRef.current) return;
    endGame(solvedRef.current >= DEF.rewardThreshold);
  }, [endGame]);

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
    >
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
          <Zap className="h-4 w-4" /> {solved}/{DEF.maxScore}
        </div>
        <div className="text-xs text-white/60">Hedef: {DEF.rewardThreshold} hat</div>
        <div className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/70">{taps} çevirme</div>
      </div>

      <div
        ref={arenaRef}
        className="relative mx-auto overflow-hidden rounded-2xl p-3"
        style={{
          width: 'min(100%, 340px)',
          background: 'radial-gradient(circle at 50% 30%, #062a33 0%, #04161c 55%, #03080d 85%)',
        }}
      >
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold">
          <span className="flex items-center gap-1 text-cyan-300"><Radio className="h-3.5 w-3.5" /> Kaynak</span>
          <span className="flex items-center gap-1 text-cyan-300">Sunucu <Server className="h-3.5 w-3.5" /></span>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
          {grid.map((row, y) =>
            row.map((cell, x) => {
              const lit = flow.has(`${x},${y}`);
              const isSrc = x === SRC[0] && y === SRC[1];
              const isDst = x === DST[0] && y === DST[1];
              return (
                <motion.button
                  key={`${x},${y}`}
                  type="button"
                  onClick={(e) => rotateCell(x, y, e)}
                  whileTap={{ scale: 0.88, rotate: 12 }}
                  className="relative flex aspect-square items-center justify-center rounded-lg border"
                  style={{
                    borderColor: lit ? `${DEF.accent}` : 'rgba(255,255,255,0.1)',
                    background: lit
                      ? 'radial-gradient(circle, rgba(6,182,212,0.22), rgba(6,182,212,0.05))'
                      : 'rgba(255,255,255,0.03)',
                    boxShadow: lit ? `0 0 14px ${DEF.accent}66` : 'none',
                  }}
                >
                  <PipeGlyph mask={cell.mask} lit={lit} accent={DEF.accent} />
                  {isSrc && <span className="absolute -left-0.5 -top-0.5 text-[9px]">📡</span>}
                  {isDst && <span className="absolute -right-0.5 -bottom-0.5 text-[9px]">🖥️</span>}
                </motion.button>
              );
            })
          )}
        </div>
        <FxLayer ref={fxRef} />
        <button
          onClick={giveUp}
          className="relative z-10 mt-3 w-full rounded-xl py-2 text-xs font-bold text-black"
          style={{ background: DEF.accent, boxShadow: `0 0 16px ${DEF.accent}55` }}
        >
          ✅ Bitir & Skoru Al ({solved})
        </button>
        <p className="mt-1.5 text-center text-[10px] text-white/40">🔧 Hücrelere dokun = döndür · 📡→🖥️ kesintisiz hat kur · {DEF.rewardThreshold}+ hat = ödül</p>
      </div>
    </GameShell>
  );
}

// Bir hücredeki boru bağlantılarını SVG çizgilerle çiz.
function PipeGlyph({ mask, lit, accent }: { mask: number; lit: boolean; accent: string }) {
  const color = lit ? accent : 'rgba(255,255,255,0.35)';
  const stroke = lit ? 5 : 4;
  const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (mask & UP) segs.push({ x1: 50, y1: 50, x2: 50, y2: 4 });
  if (mask & RIGHT) segs.push({ x1: 50, y1: 50, x2: 96, y2: 50 });
  if (mask & DOWN) segs.push({ x1: 50, y1: 50, x2: 50, y2: 96 });
  if (mask & LEFT) segs.push({ x1: 50, y1: 50, x2: 4, y2: 50 });
  const bits = [UP, RIGHT, DOWN, LEFT].filter((b) => mask & b).length;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={{ filter: lit ? `drop-shadow(0 0 4px ${accent})` : 'none' }}>
      {segs.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      ))}
      {bits > 0 && <circle cx={50} cy={50} r={bits === 1 ? 7 : 6} fill={color} />}
    </svg>
  );
}
