'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Flame } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxHit, sfxWin, sfxCombo, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('combo-tap')!;
const ROUND_MS = 30_000;
const ARENA_H = 420;

interface Target {
  id: number;
  x: number; // %
  y: number; // %
  bad: boolean;
  golden: boolean; // nadir altın hedef → büyük bonus
  born: number;
  ttl: number;
}

let _seq = 0;

export function ComboTapGame() {
  const game = useMiniGame('combo-tap');
  const [targets, setTargets] = useState<Target[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));

  const scoreRef = useRef(0);
  const comboRef = useRef(0);
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
      setTargets([]);
      if (won) sfxWin();
      else sfxHit();
      void game.finish(scoreRef.current, won);
    },
    [game]
  );

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = 0;
    comboRef.current = 0;
    setScore(0);
    setCombo(0);
    setTargets([]);
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const spawn = () => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - startedAt;
      const bad = Math.random() < 0.22;
      // Nadir altın hedef (%8) — kısa ömürlü ama 5 puan değerinde.
      const golden = !bad && Math.random() < 0.08;
      const baseTtl = Math.max(700, 1500 - (elapsed / ROUND_MS) * 800); // hızlanır
      const ttl = golden ? baseTtl * 0.7 : baseTtl;
      const t: Target = {
        id: ++_seq,
        x: 12 + Math.random() * 76,
        y: 16 + Math.random() * 64,
        bad,
        golden,
        born: Date.now(),
        ttl,
      };
      setTargets((prev) => [...prev.slice(-6), t]);
      setTimeout(() => {
        setTargets((prev) => {
          const still = prev.find((p) => p.id === t.id);
          // İyi hedef kaçırılırsa kombo sıfırlanır.
          if (still && !still.bad && runningRef.current) {
            comboRef.current = 0;
            setCombo(0);
          }
          return prev.filter((p) => p.id !== t.id);
        });
      }, ttl);
    };

    const spawnTimer = setInterval(spawn, 620);
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setTimeLeft(Math.max(0, Math.round((ROUND_MS - elapsed) / 1000)));
      if (elapsed >= ROUND_MS) {
        clearInterval(tick);
        clearInterval(spawnTimer);
        endGame(scoreRef.current >= DEF.rewardThreshold);
      }
    }, 250);

    return () => {
      clearInterval(spawnTimer);
      clearInterval(tick);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const tap = useCallback(
    (t: Target) => {
      if (!runningRef.current) return;
      setTargets((prev) => prev.filter((p) => p.id !== t.id));
      const p = toPx(t.x, t.y);
      if (t.bad) {
        comboRef.current = 0;
        setCombo(0);
        sfxBoom();
        haptic([20, 40]);
        fxRef.current?.burst(p.x, p.y, '#f43f5e', 18);
        fxRef.current?.shockwave(p.x, p.y, '#f43f5e', 140);
        fxRef.current?.floatText(p.x, p.y, 'Yanlış!', '#fca5a5');
        return;
      }
      comboRef.current += 1;
      setCombo(comboRef.current);
      // Altın hedef → 5 puan jackpot; normal kombo çarpanı: her 5 komboda +2.
      const comboBonus = comboRef.current % 5 === 0 ? 2 : 1;
      const bonus = t.golden ? 5 : comboBonus;
      scoreRef.current += bonus;
      setScore(scoreRef.current);
      sfxCombo(comboRef.current);
      haptic(t.golden ? [10, 20, 10] : 8);
      const fxColor = t.golden ? '#fbbf24' : DEF.accent;
      fxRef.current?.burst(p.x, p.y, fxColor, t.golden ? 30 : 22);
      fxRef.current?.ring(p.x, p.y, fxColor);
      fxRef.current?.floatText(p.x, p.y, t.golden ? '🌟 +5!' : bonus > 1 ? `🔥 +${bonus}` : '+1', t.golden ? '#fde68a' : '#fdba74');
      // Jackpot ya da her 5 kombo → büyük kutlama.
      if (t.golden || comboRef.current % 5 === 0) {
        sfxFanfare();
        fxRef.current?.shockwave(p.x, p.y, '#fbbf24', t.golden ? 190 : 160);
        fxRef.current?.confettiAt(p.x, p.y, ['#f97316', '#fbbf24', '#fde68a'], t.golden ? 22 : 16);
      }
      if (scoreRef.current >= DEF.maxScore) endGame(true);
    },
    [endGame, toPx]
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
        <motion.div key={score} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
          <Zap className="h-4 w-4" /> {score}
        </motion.div>
        <AnimatePresence>
          {combo >= 3 && (
            <motion.div key={combo} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 font-bold text-orange-400" style={{ textShadow: '0 0 12px rgba(249,115,22,0.8)' }}>
              <Flame className="h-4 w-4" /> {combo}x
            </motion.div>
          )}
        </AnimatePresence>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl"
        style={{ height: ARENA_H, background: 'radial-gradient(circle at 50% 40%, #3a1d05 0%, #1a0e02 55%, #0a0500 85%)' }}
      >
        <AnimatePresence>
          {targets.map((t) => (
            <motion.button
              key={t.id}
              type="button"
              onClick={() => tap(t)}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 16 }}
              whileTap={{ scale: 0.8 }}
              className="absolute flex h-14 w-14 items-center justify-center rounded-full text-2xl"
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                transform: 'translate(-50%, -50%)',
                background: t.bad
                  ? 'radial-gradient(circle, rgba(244,63,94,0.9), rgba(120,20,40,0.7))'
                  : t.golden
                  ? 'radial-gradient(circle, #fde68a, #f59e0b)'
                  : `radial-gradient(circle, ${DEF.accent}, ${DEF.accent}66)`,
                boxShadow: t.bad ? '0 0 22px #f43f5e' : t.golden ? '0 0 30px #fbbf24' : `0 0 22px ${DEF.accent}`,
              }}
            >
              {t.bad ? '💣' : t.golden ? '🌟' : '⭐'}
              {/* TTL halkası */}
              <motion.span
                className="absolute inset-0 rounded-full border-2"
                style={{ borderColor: t.bad ? '#fecaca' : t.golden ? '#fef3c7' : '#fff' }}
                initial={{ scale: 1.6, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 0 }}
                transition={{ duration: t.ttl / 1000, ease: 'linear' }}
              />
            </motion.button>
          ))}
        </AnimatePresence>
        <FxLayer ref={fxRef} />
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center text-[10px] text-white/40">
          ⭐ Yıldızlara dokun · 🌟 altın = +5 jackpot · 💣 bombalardan kaç · kombo = bonus
        </div>
      </div>
    </GameShell>
  );
}
