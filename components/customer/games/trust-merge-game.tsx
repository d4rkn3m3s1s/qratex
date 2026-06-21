'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Trophy } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxWin, sfxPowerUp, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('trust-merge')!;
const N = 4;

type Dir = 'up' | 'down' | 'left' | 'right';

interface Tile {
  id: number;
  v: number;
  r: number;
  c: number;
  merged?: boolean;
  spawned?: boolean;
}

let _seq = 0;

// Renk paleti — güven seviyesi arttıkça ısınan tonlar
const TILE_STYLE: Record<number, { bg: string; fg: string }> = {
  2: { bg: '#1e3a5f', fg: '#cbe3ff' },
  4: { bg: '#1e4d4d', fg: '#bff5ee' },
  8: { bg: '#2d5a27', fg: '#d6f5c8' },
  16: { bg: '#5a5a1e', fg: '#f5f0c0' },
  32: { bg: '#6b4d12', fg: '#fde7b0' },
  64: { bg: '#7a3a12', fg: '#ffd9a8' },
  128: { bg: '#7a2a3a', fg: '#ffc0cf' },
  256: { bg: '#6b1e5a', fg: '#f5b8e8' },
  512: { bg: '#3a1e7a', fg: '#cfc0ff' },
  1024: { bg: '#1e3a8a', fg: '#bcd2ff' },
  2048: { bg: '#b8860b', fg: '#fff8e0' },
};
function styleFor(v: number) {
  return TILE_STYLE[v] ?? { bg: '#b8860b', fg: '#fff8e0' };
}

function emptyCells(tiles: Tile[]): { r: number; c: number }[] {
  const occ = new Set(tiles.map((t) => `${t.r},${t.c}`));
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!occ.has(`${r},${c}`)) out.push({ r, c });
  return out;
}

function addRandom(tiles: Tile[]): Tile[] {
  const empties = emptyCells(tiles);
  if (empties.length === 0) return tiles;
  const spot = empties[Math.floor(Math.random() * empties.length)];
  return [...tiles, { id: ++_seq, v: Math.random() < 0.9 ? 2 : 4, r: spot.r, c: spot.c, spawned: true }];
}

// Bir yöne kaydır; yeni dizilim + kazanılan puan + hareket oldu mu döner.
function slide(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; moved: boolean } {
  const horizontal = dir === 'left' || dir === 'right';
  const forward = dir === 'right' || dir === 'down';
  let gained = 0;
  let moved = false;
  const next: Tile[] = [];

  for (let line = 0; line < N; line++) {
    // bu satır/sütundaki taşları sırala
    let group = tiles
      .filter((t) => (horizontal ? t.r === line : t.c === line))
      .sort((a, b) => (horizontal ? a.c - b.c : a.r - b.r));
    if (forward) group = group.reverse();

    const merged: Tile[] = [];
    let i = 0;
    while (i < group.length) {
      const cur = group[i];
      if (i + 1 < group.length && group[i + 1].v === cur.v) {
        const nv = cur.v * 2;
        gained += nv;
        merged.push({ ...cur, v: nv, merged: true });
        i += 2;
      } else {
        merged.push({ ...cur, merged: false });
        i += 1;
      }
    }
    // pozisyon ata
    merged.forEach((t, idx) => {
      const pos = forward ? N - 1 - idx : idx;
      const nr = horizontal ? line : pos;
      const nc = horizontal ? pos : line;
      if (t.r !== nr || t.c !== nc) moved = true;
      next.push({ ...t, r: nr, c: nc, spawned: false });
    });
  }
  return { tiles: next, gained, moved };
}

export function TrustMergeGame() {
  const game = useMiniGame('trust-merge');
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(2);

  const tilesRef = useRef<Tile[]>([]);
  const scoreRef = useRef(0);
  const bestRef = useRef(2);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const lockRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<FxHandle>(null);

  const playing = game.phase === 'playing';

  const endGame = useCallback(
    (won: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      runningRef.current = false;
      if (won) sfxWin();
      else sfxHit();
      // Sunucuya gönderilen skor = en yüksek karo değeri (eşik de karo cinsinden).
      void game.finish(bestRef.current, won);
    },
    [game]
  );

  const canMove = useCallback((tiles: Tile[]): boolean => {
    if (emptyCells(tiles).length > 0) return true;
    const grid: Record<string, number> = {};
    tiles.forEach((t) => (grid[`${t.r},${t.c}`] = t.v));
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const v = grid[`${r},${c}`];
        if (grid[`${r},${c + 1}`] === v || grid[`${r + 1},${c}`] === v) return true;
      }
    return false;
  }, []);

  const doMove = useCallback(
    (dir: Dir) => {
      if (!runningRef.current || lockRef.current) return;
      const { tiles: moved, gained, moved: didMove } = slide(tilesRef.current, dir);
      if (!didMove) return;
      lockRef.current = true;
      const after = addRandom(moved);
      tilesRef.current = after;
      setTiles(after);

      if (gained > 0) {
        scoreRef.current += gained;
        setScore(scoreRef.current);
        sfxCollectStar(Math.min(5, Math.log2(gained)));
        haptic(8);
      } else {
        sfxPowerUp();
      }

      const top = Math.max(...after.map((t) => t.v));
      if (top > bestRef.current) {
        bestRef.current = top;
        setBest(top);
        // yeni rekor karo → kutlama
        const rect = arenaRef.current?.getBoundingClientRect();
        const cx = rect ? rect.width / 2 : 0;
        const cy = rect ? rect.height / 2 : 0;
        const big = top >= 64;
        if (big) {
          sfxFanfare();
          haptic([10, 20, 10]);
          fxRef.current?.shockwave(cx, cy, styleFor(top).fg, 200);
          fxRef.current?.confettiAt(cx, cy, ['#fbbf24', '#f59e0b', '#fde68a'], 22);
        }
      }

      if (top >= DEF.maxScore) {
        sfxFanfare();
        sfxBoom();
        setTimeout(() => endGame(true), 400);
        lockRef.current = false;
        return;
      }
      if (!canMove(after)) {
        // tahta doldu → en yüksek karo eşik üstüyse kazandı
        setTimeout(() => endGame(bestRef.current >= DEF.rewardThreshold), 500);
        return;
      }
      setTimeout(() => {
        lockRef.current = false;
      }, 130);
    },
    [canMove, endGame]
  );

  // İstediğin an skoru kasala (eşiği geçtiysen ödülü al). 2048'i beklemene gerek yok.
  const cashOut = useCallback(() => {
    if (finishedRef.current) return;
    endGame(bestRef.current >= DEF.rewardThreshold);
  }, [endGame]);

  // klavye
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
      };
      const d = map[e.key];
      if (d) {
        e.preventDefault();
        doMove(d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, doMove]);

  // swipe
  useEffect(() => {
    if (!playing) return;
    const el = arenaRef.current;
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
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
      else doMove(dy > 0 ? 'down' : 'up');
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [playing, doMove]);

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    runningRef.current = true;
    lockRef.current = false;
    scoreRef.current = 0;
    bestRef.current = 2;
    setScore(0);
    setBest(2);
    let init: Tile[] = [];
    init = addRandom(init);
    init = addRandom(init);
    tilesRef.current = init;
    setTiles(init);
  }, [playing]);

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
          <TrendingUp className="h-4 w-4" /> {score}
        </div>
        <div className="text-xs text-white/60">Hedef karo: {DEF.rewardThreshold}</div>
        <div className="flex items-center gap-1.5 text-amber-300">
          <Trophy className="h-4 w-4" /> {best}
        </div>
      </div>

      <div className="flex justify-center">
        <div
          ref={arenaRef}
          className="relative touch-none select-none rounded-2xl p-2.5"
          style={{
            width: 'min(100%, 340px)',
            aspectRatio: '1',
            background: 'linear-gradient(135deg, #1a1206, #0a0703)',
            boxShadow: `0 0 30px ${DEF.accent}33`,
          }}
        >
          {/* boş hücre ızgarası */}
          <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-2.5">
            {Array.from({ length: N * N }).map((_, i) => (
              <div key={i} className="rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>

          {/* taşlar */}
          <div className="absolute inset-2.5">
            <AnimatePresence>
              {tiles.map((t) => {
                const st = styleFor(t.v);
                const cellPct = 100 / N;
                return (
                  <motion.div
                    key={t.id}
                    initial={t.spawned ? { scale: 0 } : false}
                    animate={{
                      scale: t.merged ? [1, 1.18, 1] : 1,
                      left: `calc(${t.c * cellPct}% + ${t.c * 0}px)`,
                      top: `calc(${t.r * cellPct}% + ${t.r * 0}px)`,
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    className="absolute flex items-center justify-center rounded-xl font-black"
                    style={{
                      width: `calc(${cellPct}% - 7px)`,
                      height: `calc(${cellPct}% - 7px)`,
                      margin: '3.5px',
                      background: st.bg,
                      color: st.fg,
                      fontSize: t.v >= 1024 ? '1.05rem' : t.v >= 128 ? '1.3rem' : '1.6rem',
                      boxShadow: `0 0 16px ${st.bg}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                    }}
                  >
                    {t.v}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          <FxLayer ref={fxRef} />
        </div>
      </div>

      {/* Bitir & skoru kasala — eşiği geçtiyse parlar, ödülü garanti alırsın */}
      <button
        onClick={cashOut}
        className="mx-auto mt-3 flex w-full max-w-[340px] items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition active:scale-95"
        style={
          best >= DEF.rewardThreshold
            ? { background: '#22c55e', color: '#04130d', boxShadow: '0 0 20px #22c55e88' }
            : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)' }
        }
      >
        {best >= DEF.rewardThreshold ? `✅ Bitir & Ödülü Al (${best} karo)` : `Bitir (henüz ${DEF.rewardThreshold} karo yok)`}
      </button>

      {/* mobil yön tuşları */}
      <div className="mx-auto mt-3 grid w-[168px] grid-cols-3 gap-1.5 sm:hidden">
        <span />
        <Arrow label="▲" onTap={() => doMove('up')} accent={DEF.accent} />
        <span />
        <Arrow label="◀" onTap={() => doMove('left')} accent={DEF.accent} />
        <Arrow label="▼" onTap={() => doMove('down')} accent={DEF.accent} />
        <Arrow label="▶" onTap={() => doMove('right')} accent={DEF.accent} />
      </div>
      <p className="mt-2 text-center text-[10px] text-white/40">⌨️ Oklar / 📱 kaydır · aynıları birleştir · {DEF.rewardThreshold} karosuna ulaş = ödül</p>
    </GameShell>
  );
}

function Arrow({ label, onTap, accent }: { label: string; onTap: () => void; accent: string }) {
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
