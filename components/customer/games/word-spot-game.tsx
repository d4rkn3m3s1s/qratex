'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Zap, Heart, Flame } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxHit, sfxPowerUp, sfxWin, sfxCombo, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('word-spot')!;
const MAX_LIVES = 3;
const TOTAL_ROUNDS = 12;
const ROUND_TIME_MS = 5500;

// Birbirine çok benzeyen kelime çiftleri (normal / sahte).
const PAIRS: [string, string][] = [
  ['Harika', 'Harıka'],
  ['Mükemmel', 'Mükemel'],
  ['Tavsiye', 'Tavisye'],
  ['Lezzetli', 'Lezetli'],
  ['Temiz', 'Temız'],
  ['Hızlı', 'Hizli'],
  ['Güler yüz', 'Güleryüz'],
  ['Kaliteli', 'Kalitelı'],
  ['Servis', 'Servís'],
  ['Memnun', 'Memnnun'],
];

interface Tile {
  id: number;
  text: string;
  fake: boolean;
}

let _seq = 0;
function buildRound(): { tiles: Tile[]; cols: number } {
  const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
  const [normal, fake] = pair;
  const count = 9; // 3x3
  const fakeIdx = Math.floor(Math.random() * count);
  const tiles: Tile[] = Array.from({ length: count }, (_, i) => ({
    id: ++_seq,
    text: i === fakeIdx ? fake : normal,
    fake: i === fakeIdx,
  }));
  return { tiles, cols: 3 };
}

export function WordSpotGame() {
  const game = useMiniGame('word-spot');
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_TIME_MS / 1000));
  const [combo, setCombo] = useState(0);

  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const roundRef = useRef(0);
  const comboRef = useRef(0);
  const finishedRef = useRef(false);
  const lockRef = useRef(false);
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

  const nextRound = useCallback(() => {
    if (finishedRef.current) return;
    if (roundRef.current >= TOTAL_ROUNDS || livesRef.current <= 0) {
      endGame(scoreRef.current >= DEF.rewardThreshold && livesRef.current > 0);
      return;
    }
    roundRef.current += 1;
    setRound(roundRef.current);
    const { tiles: t } = buildRound();
    setTiles(t);
    lockRef.current = false;
    setTimeLeft(Math.round(ROUND_TIME_MS / 1000));
    sfxPowerUp();
  }, [endGame]);

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    roundRef.current = 0;
    comboRef.current = 0;
    setScore(0);
    setLives(MAX_LIVES);
    setCombo(0);
    nextRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Tur geri sayımı — süre dolarsa can kaybı.
  useEffect(() => {
    if (!playing || lockRef.current || tiles.length === 0) return;
    const startedAt = Date.now();
    const t = setInterval(() => {
      const remain = Math.max(0, Math.round((ROUND_TIME_MS - (Date.now() - startedAt)) / 1000));
      setTimeLeft(remain);
      if (remain <= 0) {
        clearInterval(t);
        if (!lockRef.current) {
          lockRef.current = true;
          comboRef.current = 0;
          setCombo(0);
          livesRef.current -= 1;
          setLives(livesRef.current);
          sfxHit();
          haptic(20);
          setTimeout(nextRound, 700);
        }
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, playing]);

  const pick = useCallback(
    (tile: Tile, e: React.MouseEvent) => {
      if (lockRef.current) return;
      lockRef.current = true;
      const rect = arenaRef.current?.getBoundingClientRect();
      const px = rect ? e.clientX - rect.left : 0;
      const py = rect ? e.clientY - rect.top : 0;
      if (tile.fake) {
        comboRef.current += 1;
        setCombo(comboRef.current);
        const comboBonus = comboRef.current % 4 === 0 ? 1 : 0;
        scoreRef.current += 1 + comboBonus;
        setScore(scoreRef.current);
        sfxCombo(comboRef.current);
        haptic(8);
        fxRef.current?.burst(px, py, DEF.accent, 22);
        fxRef.current?.ring(px, py, DEF.accent);
        fxRef.current?.floatText(px, py, comboBonus ? '+2' : '+1', '#ddd6fe');
        if (comboRef.current > 0 && comboRef.current % 4 === 0) {
          sfxFanfare();
          fxRef.current?.shockwave(px, py, DEF.accent, 160);
          fxRef.current?.confettiAt(px, py, ['#a78bfa', '#c4b5fd', '#fbbf24'], 16);
        }
        if (scoreRef.current >= DEF.maxScore) {
          setTimeout(() => endGame(true), 300);
          return;
        }
      } else {
        comboRef.current = 0;
        setCombo(0);
        livesRef.current -= 1;
        setLives(livesRef.current);
        sfxBoom();
        haptic([20, 40]);
        fxRef.current?.burst(px, py, '#f43f5e', 16);
        fxRef.current?.shockwave(px, py, '#f43f5e', 140);
        fxRef.current?.floatText(px, py, 'Yanlış! -1', '#fca5a5');
      }
      setTimeout(nextRound, 700);
    },
    [endGame, nextRound]
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
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart key={i} className="h-4 w-4" style={{ color: i < lives ? '#f43f5e' : '#3f3f46', fill: i < lives ? '#f43f5e' : 'transparent' }} />
          ))}
        </div>
        <div className="flex items-center gap-2" style={{ color: DEF.accent }}>
          <span>Tur {round}/{TOTAL_ROUNDS}</span>
          {combo >= 2 && (
            <span className="flex items-center gap-0.5 font-bold text-orange-400"><Flame className="h-3.5 w-3.5" />{combo}x</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" style={{ color: DEF.accent }}><Zap className="h-4 w-4" /> {score}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</span>
        </div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl p-4"
        style={{ background: 'radial-gradient(circle at 50% 25%, #261a4d 0%, #130b2a 50%, #070414 85%)' }}
      >
        <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-violet-300/80">
          <Eye className="h-4 w-4" /> Farklı/yanlış yazılmış olanı bul!
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <AnimatePresence mode="popLayout">
            {tiles.map((t, i) => (
              <motion.button
                key={t.id}
                type="button"
                layout
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ delay: Math.min(i, 10) * 0.03, type: 'spring', stiffness: 240, damping: 18 }}
                onClick={(e) => pick(t, e)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="flex aspect-[3/2] items-center justify-center rounded-xl border px-1 text-center text-sm font-semibold text-white"
                style={{
                  borderColor: 'rgba(255,255,255,0.12)',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                }}
              >
                {t.text}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
        <FxLayer ref={fxRef} />
        <p className="mt-3 text-center text-[10px] text-white/40">🧩 Çoğunluk aynı, biri farklı. {DEF.rewardThreshold}+ doğru = ödül</p>
      </div>
    </GameShell>
  );
}
