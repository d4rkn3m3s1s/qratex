'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { Brain, MousePointerClick } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxClick, sfxFanfare, sfxWin, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('memory-match')!;
const PAIRS = ['⭐', '🚀', '💎', '🔥', '⚡', '🎯', '🏆', '🛡️']; // 8 çift = 16 kart
const MAX_MOVES = 28; // bu hamleden fazlasında tur biter

interface Card {
  id: number;
  face: string;
  flipped: boolean;
  matched: boolean;
}

let _seq = 0;
function buildDeck(): Card[] {
  const deck = [...PAIRS, ...PAIRS].map((face) => ({ id: ++_seq, face, flipped: false, matched: false }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function MemoryMatchGame() {
  const game = useMiniGame('memory-match');
  const [cards, setCards] = useState<Card[]>([]);
  const [pairsFound, setPairsFound] = useState(0);
  const [moves, setMoves] = useState(0);

  const scoreRef = useRef(0);
  const movesRef = useRef(0);
  const flippedRef = useRef<number[]>([]);
  const lockRef = useRef(false);
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
    movesRef.current = 0;
    flippedRef.current = [];
    lockRef.current = false;
    setPairsFound(0);
    setMoves(0);
    setCards(buildDeck());
  }, [playing]);

  const flip = useCallback(
    (card: Card, e: React.MouseEvent) => {
      if (lockRef.current || card.flipped || card.matched || finishedRef.current) return;
      sfxClick();
      haptic(5);
      const flipped = [...flippedRef.current, card.id];
      flippedRef.current = flipped;
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, flipped: true } : c)));

      if (flipped.length === 2) {
        movesRef.current += 1;
        setMoves(movesRef.current);
        lockRef.current = true;
        const [a, b] = flipped;
        setCards((prev) => {
          const ca = prev.find((c) => c.id === a);
          const cb = prev.find((c) => c.id === b);
          const match = ca && cb && ca.face === cb.face;
          if (match) {
            scoreRef.current += 1;
            setPairsFound(scoreRef.current);
            sfxCollectStar(scoreRef.current % 6);
            haptic(10);
            const rect = arenaRef.current?.getBoundingClientRect();
            if (rect) {
              const fx = e.clientX - rect.left;
              const fy = e.clientY - rect.top;
              fxRef.current?.burst(fx, fy, DEF.accent, 24);
              fxRef.current?.ring(fx, fy, DEF.accent);
              fxRef.current?.confettiAt(fx, fy, ['#ec4899', '#f472b6', '#fbbf24'], 14);
            }
            flippedRef.current = [];
            lockRef.current = false;
            const next = prev.map((c) => (c.id === a || c.id === b ? { ...c, matched: true } : c));
            if (next.every((c) => c.matched)) { sfxFanfare(); setTimeout(() => endGame(true), 500); }
            return next;
          }
          // eşleşme yok: kısa süre sonra geri kapat
          setTimeout(() => {
            setCards((p2) => p2.map((c) => (c.id === a || c.id === b ? { ...c, flipped: false } : c)));
            flippedRef.current = [];
            lockRef.current = false;
            if (movesRef.current >= MAX_MOVES) {
              endGame(scoreRef.current >= DEF.rewardThreshold);
            }
          }, 720);
          sfxHit();
          haptic(15);
          return prev;
        });
      }
    },
    [endGame]
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
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
          <Brain className="h-4 w-4" /> {pairsFound}/{PAIRS.length} çift
        </div>
        <div className="flex items-center gap-1.5 text-white/70">
          <MousePointerClick className="h-4 w-4" /> {moves}/{MAX_MOVES} hamle
        </div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl p-4"
        style={{ perspective: '1000px', background: 'radial-gradient(circle at 50% 25%, #3a0a28 0%, #1c0514 50%, #0a0308 85%)' }}
      >
        <div className="grid grid-cols-4 gap-2.5">
          {cards.map((c, i) => {
            const show = c.flipped || c.matched;
            return (
              <Motion.button
                key={c.id}
                type="button"
                onClick={(e) => flip(c, e)}
                disabled={show}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1, rotateY: show ? 180 : 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02, type: 'spring', stiffness: 260, damping: 20 }}
                className="relative flex aspect-square items-center justify-center rounded-xl border text-2xl"
                style={{
                  transformStyle: 'preserve-3d',
                  borderColor: c.matched ? `${DEF.accent}` : 'rgba(255,255,255,0.14)',
                  background: c.matched
                    ? `linear-gradient(135deg, ${DEF.accent}33, ${DEF.accent}11)`
                    : show
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
                    : 'linear-gradient(135deg, rgba(120,30,80,0.5), rgba(60,15,40,0.5))',
                  boxShadow: c.matched ? `0 0 18px ${DEF.accent}66` : '0 4px 12px rgba(0,0,0,0.4)',
                  opacity: c.matched ? 0.85 : 1,
                }}
              >
                <span style={{ transform: show ? 'rotateY(180deg)' : 'none' }}>
                  {show ? c.face : '❔'}
                </span>
              </Motion.button>
            );
          })}
        </div>
        <FxLayer ref={fxRef} />
        <p className="mt-3 text-center text-[10px] text-white/40">🃏 Kartları çevir, eşleşen çiftleri bul. {DEF.rewardThreshold}+ çift = ödül</p>
      </div>
    </GameShell>
  );
}
