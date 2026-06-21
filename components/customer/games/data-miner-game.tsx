'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Gem } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxPowerUp, sfxWin, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('data-miner')!;
const GRID = 16; // 4x4
const MAX_LIVES = 3;

type CellKind = 'gem' | 'rare' | 'bot' | 'empty';
interface Cell {
  id: number;
  kind: CellKind;
  opened: boolean;
}

let _seq = 0;
function buildGrid(): Cell[] {
  const kinds: CellKind[] = [];
  // 4 bot, 2 nadir, 6 gem, kalan boş
  for (let i = 0; i < 4; i++) kinds.push('bot');
  for (let i = 0; i < 2; i++) kinds.push('rare');
  for (let i = 0; i < 6; i++) kinds.push('gem');
  while (kinds.length < GRID) kinds.push('empty');
  kinds.sort(() => Math.random() - 0.5);
  return kinds.map((k) => ({ id: ++_seq, kind: k, opened: false }));
}

const REWARD: Record<CellKind, number> = { gem: 1, rare: 3, bot: 0, empty: 0 };
const FACE: Record<CellKind, string> = { gem: '💠', rare: '💎', bot: '🤖', empty: '·' };

export function DataMinerGame() {
  const game = useMiniGame('data-miner');
  const [cells, setCells] = useState<Cell[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);

  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const finishedRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<FxHandle>(null);

  const playing = game.phase === 'playing';

  const endGame = useCallback(
    (won: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (won) sfxWin();
      else sfxHit();
      void game.finish(scoreRef.current, won);
    },
    [game]
  );

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    setScore(0);
    setLives(MAX_LIVES);
    setCells(buildGrid());
  }, [playing]);

  const open = useCallback(
    (cell: Cell, e: React.MouseEvent) => {
      if (finishedRef.current || cell.opened) return;
      setCells((prev) => prev.map((c) => (c.id === cell.id ? { ...c, opened: true } : c)));
      const rect = arenaRef.current?.getBoundingClientRect();
      const px = rect ? e.clientX - rect.left : 0;
      const py = rect ? e.clientY - rect.top : 0;

      if (cell.kind === 'bot') {
        livesRef.current -= 1;
        setLives(livesRef.current);
        sfxBoom();
        haptic([20, 40]);
        fxRef.current?.burst(px, py, '#f43f5e', 20);
        fxRef.current?.shockwave(px, py, '#f43f5e', 150);
        fxRef.current?.floatText(px, py, 'Tuzak! -1', '#fca5a5');
        if (livesRef.current <= 0) {
          setTimeout(() => endGame(scoreRef.current >= DEF.rewardThreshold), 700);
        }
        return;
      }

      const gain = REWARD[cell.kind];
      if (gain > 0) {
        scoreRef.current += gain;
        setScore(scoreRef.current);
        const isRare = cell.kind === 'rare';
        sfxCollectStar(scoreRef.current % 6);
        haptic(isRare ? [10, 20] : 8);
        fxRef.current?.burst(px, py, isRare ? '#fbbf24' : DEF.accent, isRare ? 28 : 18);
        fxRef.current?.ring(px, py, isRare ? '#fbbf24' : DEF.accent);
        fxRef.current?.floatText(px, py, `+${gain}`, isRare ? '#fcd34d' : '#67e8f9');
        if (isRare) {
          // Nadir veri → büyük kutlama.
          sfxFanfare();
          fxRef.current?.shockwave(px, py, '#fbbf24', 170);
          fxRef.current?.confettiAt(px, py, ['#fbbf24', '#06b6d4', '#fde68a'], 18);
        }
      } else {
        sfxPowerUp();
      }

      if (scoreRef.current >= DEF.maxScore) {
        setTimeout(() => endGame(true), 500);
        return;
      }
      // Tüm güvenli hücreler açıldıysa tur biter.
      setCells((prev) => {
        const remainingSafe = prev.some((c) => !c.opened && c.kind !== 'bot' && c.id !== cell.id);
        if (!remainingSafe) {
          setTimeout(() => endGame(scoreRef.current >= DEF.rewardThreshold), 600);
        }
        return prev;
      });
    },
    [endGame]
  );

  const cashOut = useCallback(() => {
    if (finishedRef.current) return;
    endGame(scoreRef.current >= DEF.rewardThreshold);
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
      copy={getGameCopy(DEF.gameType)}
    >
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart key={i} className="h-4 w-4" style={{ color: i < lives ? '#f43f5e' : '#3f3f46', fill: i < lives ? '#f43f5e' : 'transparent' }} />
          ))}
        </div>
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}><Gem className="h-4 w-4" /> {score}</div>
        <div className="text-xs text-white/60">Hedef: {DEF.rewardThreshold}</div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl p-4"
        style={{
          perspective: '900px',
          background: 'radial-gradient(circle at 50% 25%, #062a33 0%, #04161c 50%, #03080d 85%)',
        }}
      >
        <div className="grid grid-cols-4 gap-2.5">
          {cells.map((c, i) => (
            <motion.button
              key={c.id}
              type="button"
              onClick={(e) => open(c, e)}
              disabled={c.opened}
              initial={{ opacity: 0, scale: 0.6, rotateY: -90 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ delay: i * 0.03, type: 'spring', stiffness: 200, damping: 18 }}
              whileHover={!c.opened ? { scale: 1.07, rotateX: 8, rotateY: 8 } : {}}
              whileTap={{ scale: 0.92 }}
              className="relative flex aspect-square items-center justify-center rounded-xl border text-2xl"
              style={{
                transformStyle: 'preserve-3d',
                borderColor: c.opened
                  ? c.kind === 'bot' ? '#f43f5e' : c.kind === 'rare' ? '#fbbf24' : `${DEF.accent}88`
                  : 'rgba(255,255,255,0.14)',
                background: c.opened
                  ? c.kind === 'bot'
                    ? 'linear-gradient(135deg, rgba(120,20,40,0.7), rgba(60,10,20,0.7))'
                    : c.kind === 'rare'
                    ? 'linear-gradient(135deg, rgba(120,90,10,0.6), rgba(60,45,5,0.6))'
                    : 'linear-gradient(135deg, rgba(6,80,95,0.5), rgba(3,40,50,0.5))'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                boxShadow: c.opened && c.kind !== 'empty' ? `0 0 18px ${c.kind === 'bot' ? '#f43f5e' : c.kind === 'rare' ? '#fbbf24' : DEF.accent}66` : '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              {c.opened ? FACE[c.kind] : <span className="text-white/30">⬡</span>}
            </motion.button>
          ))}
        </div>

        <FxLayer ref={fxRef} />

        <button
          onClick={cashOut}
          className="relative z-10 mt-4 w-full rounded-xl py-2.5 text-sm font-bold text-black transition"
          style={{ background: DEF.accent, boxShadow: `0 0 18px ${DEF.accent}55` }}
        >
          💰 Çık & Skoru Kasala ({score})
        </button>
        <p className="mt-1.5 text-center text-[10px] text-white/40">💠 +1 · 💎 nadir +3 · 🤖 tuzak -1 can. İstediğin an çıkabilirsin!</p>
      </div>
    </GameShell>
  );
}
