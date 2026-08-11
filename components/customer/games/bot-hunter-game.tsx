'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, UserCheck, ShieldCheck, Heart, Flame } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxPowerUp, sfxWin, sfxCombo, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('bot-hunter')!;
const MAX_LIVES = 3;
const TOTAL_ROUNDS = 10;
const ROUND_TIME_MS = 6500;

interface Profile {
  id: number;
  name: string;
  handle: string;
  avatar: string;
  bot: boolean;
  flagged: boolean;
}

const HUMAN_NAMES = ['Ayşe K.', 'Mehmet T.', 'Zeynep A.', 'Can D.', 'Elif S.', 'Burak Y.', 'Deniz P.', 'Selin M.'];
const BOT_NAMES = ['user_8842x', 'qwz_99201', 'free_gift_x', 'real_acc_77', 'promo_bot_5', 'x_aZ91k0', 'win_now_24'];
const HUMAN_AV = ['🧑', '👩', '🧔', '👱‍♀️', '👨', '👩‍🦰', '🧑‍🦱'];
const BOT_AV = ['🤖', '👾', '🛸', '📡'];

let _seq = 0;
function buildRound(): Profile[] {
  const botCount = 1 + Math.floor(Math.random() * 3);
  const arr: Profile[] = [];
  for (let i = 0; i < 6; i++) {
    const bot = i < botCount;
    arr.push({
      id: ++_seq,
      bot,
      name: bot
        ? BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
        : HUMAN_NAMES[Math.floor(Math.random() * HUMAN_NAMES.length)],
      handle: bot
        ? `@${Math.random().toString(36).slice(2, 9)}`
        : `@${HUMAN_NAMES[i % HUMAN_NAMES.length].split(' ')[0].toLowerCase()}`,
      avatar: bot
        ? BOT_AV[Math.floor(Math.random() * BOT_AV.length)]
        : HUMAN_AV[Math.floor(Math.random() * HUMAN_AV.length)],
      flagged: false,
    });
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function BotHunterGame() {
  const game = useMiniGame('bot-hunter');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [scanKey, setScanKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
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
    setProfiles(buildRound());
    setRevealed(false);
    lockRef.current = false;
    setScanKey((k) => k + 1);
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

  const arenaCenter = useCallback(() => {
    const el = arenaRef.current;
    return { x: (el?.clientWidth ?? 300) / 2, y: (el?.clientHeight ?? 300) / 2 };
  }, []);

  const resolveRound = useCallback(() => {
    if (lockRef.current) return;
    lockRef.current = true;
    setRevealed(true);
    const botsCorrect = profiles.every((p) => (p.bot ? p.flagged : true)); // tüm botlar işaretli
    const noFalsePositive = profiles.every((p) => (p.bot ? true : !p.flagged)); // insan işaretlenmemiş
    const perfect = botsCorrect && noFalsePositive && profiles.some((p) => p.bot);
    const c = arenaCenter();
    if (perfect) {
      comboRef.current += 1;
      setCombo(comboRef.current);
      // Kombo bonusu: her 3 mükemmel turda +1 ekstra.
      const comboBonus = comboRef.current % 3 === 0 ? 1 : 0;
      const gain = 1 + comboBonus;
      scoreRef.current += gain;
      setScore(scoreRef.current);
      sfxCombo(comboRef.current);
      haptic(10);
      fxRef.current?.burst(c.x, c.y, DEF.accent, 28);
      fxRef.current?.ring(c.x, c.y, DEF.accent);
      fxRef.current?.floatText(c.x, c.y - 30, gain > 1 ? `Mükemmel! +${gain}` : 'Temiz! +1', '#6ee7b7');
      if (comboRef.current > 0 && comboRef.current % 3 === 0) {
        sfxFanfare();
        fxRef.current?.shockwave(c.x, c.y, DEF.accent, 170);
        fxRef.current?.confettiAt(c.x, c.y, ['#34d399', '#22d3ee', '#fbbf24'], 20);
      }
      if (scoreRef.current >= DEF.maxScore) {
        setTimeout(() => endGame(true), 600);
        return;
      }
    } else {
      comboRef.current = 0;
      setCombo(0);
      livesRef.current -= 1;
      setLives(livesRef.current);
      sfxBoom();
      haptic([20, 40]);
      fxRef.current?.burst(c.x, c.y, '#f43f5e', 22);
      fxRef.current?.shockwave(c.x, c.y, '#f43f5e', 150);
      fxRef.current?.floatText(c.x, c.y - 30, noFalsePositive ? 'Bot kaçtı! -1' : 'Yanlış suçlama! -1', '#fca5a5');
    }
    setTimeout(nextRound, 1200);
  }, [profiles, nextRound, arenaCenter, endGame]);

  // Tur süresi (turlar ilerledikçe kısalır — zorluk artar).
  const roundTimeMs = Math.max(4000, ROUND_TIME_MS - roundRef.current * 250);
  useEffect(() => {
    if (!playing || revealed || profiles.length === 0) return;
    const t = setTimeout(() => {
      if (!lockRef.current) resolveRound();
    }, roundTimeMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey, playing]);

  const toggleFlag = useCallback((id: number) => {
    if (lockRef.current) return;
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, flagged: !p.flagged } : p)));
  }, []);

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
      {/* HUD */}
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart
              key={i}
              className="h-4 w-4"
              style={{ color: i < lives ? '#f43f5e' : '#3f3f46', fill: i < lives ? '#f43f5e' : 'transparent' }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2" style={{ color: DEF.accent }}>
          <span>Tur {round}/{TOTAL_ROUNDS}</span>
          {combo >= 2 && (
            <span className="flex items-center gap-0.5 font-bold text-orange-400"><Flame className="h-3.5 w-3.5" />{combo}x</span>
          )}
        </div>
        <motion.div key={score} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
          <ShieldCheck className="h-4 w-4" /> {score}
        </motion.div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl p-3"
        style={{
          perspective: '1000px',
          background: 'radial-gradient(circle at 50% 25%, #053b34 0%, #04201d 45%, #03060f 85%)',
        }}
      >
        {/* Dönen radar süpürmesi */}
        <motion.div
          key={`r-${scanKey}`}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${DEF.accent}00 0deg, ${DEF.accent}00 300deg, ${DEF.accent}55 360deg)`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        />

        {/* Tarama ilerleme çubuğu */}
        {!revealed && (
          <motion.div
            key={`bar-${scanKey}`}
            className="absolute left-0 top-0 z-30 h-1"
            style={{ background: DEF.accent, boxShadow: `0 0 10px ${DEF.accent}` }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: roundTimeMs / 1000, ease: 'linear' }}
          />
        )}

        <div className="relative z-10 grid grid-cols-2 gap-2.5 sm:grid-cols-3" style={{ transformStyle: 'preserve-3d' }}>
          <AnimatePresence mode="popLayout">
            {profiles.map((p, i) => {
              const showTruth = revealed;
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: 20, rotateX: -25 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  exit={{ opacity: 0, scale: 0.7, rotateX: 25 }}
                  transition={{ delay: Math.min(i, 10) * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
                  onClick={() => toggleFlag(p.id)}
                  whileHover={{ scale: 1.05, rotateY: 6, z: 20 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center backdrop-blur-sm"
                  style={{
                    transformStyle: 'preserve-3d',
                    borderColor: showTruth ? (p.bot ? '#f43f5e' : '#34d399') : p.flagged ? DEF.accent : 'rgba(255,255,255,0.12)',
                    background: p.flagged
                      ? `linear-gradient(160deg, ${DEF.accent}33, ${DEF.accent}11)`
                      : 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                    boxShadow: p.flagged
                      ? `0 8px 22px ${DEF.accent}44, 0 0 16px ${DEF.accent}55`
                      : '0 6px 16px rgba(0,0,0,0.4)',
                  }}
                >
                  {/* Holografik tarama çizgileri */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-xl opacity-20"
                    style={{
                      backgroundImage: `repeating-linear-gradient(0deg, ${DEF.accent}33 0px, transparent 2px, transparent 5px)`,
                    }}
                  />
                  <motion.div
                    className="text-3xl"
                    animate={showTruth && p.bot ? { rotate: [0, -8, 8, 0] } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    {showTruth ? (p.bot ? '🤖' : p.avatar) : p.avatar}
                  </motion.div>
                  <div className="w-full truncate text-[11px] font-semibold text-white">{p.name}</div>
                  <div className="w-full truncate text-[9px] text-white/40">{p.handle}</div>

                  {p.flagged && !showTruth && (
                    <div className="absolute -right-1.5 -top-1.5 rounded-full p-1" style={{ background: DEF.accent }}>
                      <Bot className="h-3 w-3 text-black" />
                    </div>
                  )}
                  {showTruth && (
                    <div className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-1">
                      {p.bot ? <Bot className="h-3 w-3 text-rose-400" /> : <UserCheck className="h-3 w-3 text-emerald-400" />}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        <FxLayer ref={fxRef} />

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={resolveRound}
          disabled={revealed}
          className="relative z-10 mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-black transition disabled:opacity-40"
          style={{ background: DEF.accent, boxShadow: `0 0 20px ${DEF.accent}66` }}
        >
          ✓ Tara & Onayla
        </motion.button>
        <p className="relative z-10 mt-1.5 text-center text-[10px] text-white/40">
          Botları işaretle, gerçek kullanıcılara dokunma. Süre dolmadan onayla!
        </p>
      </div>
    </GameShell>
  );
}
