'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Heart, Zap, Flame, Snowflake, Star } from 'lucide-react';
import { GameShell } from './game-shell';
import { Boss3D } from './boss-3d';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import {
  sfxCollectStar,
  sfxHit,
  sfxWin,
  sfxCombo,
  sfxFanfare,
  sfxPowerUp,
  haptic,
} from '@/lib/game-sounds';

const DEF = getMiniGame('mind-thief')!;
const MAX_LIVES = 3;
const ROUND_MS = 45_000;
const ARENA_H = 420;
const RAGE_EVERY_MS = 12_000; // bu aralıkla öfke modu tetiklenir
const RAGE_DURATION_MS = 4000;

type PowerKind = 'freeze' | 'double' | 'heart';
interface FloatingComment {
  id: number;
  text: string;
  kind: 'corrupted' | 'genuine' | PowerKind;
  x: number;
  y: number;
  depth: number;
}

const CORRUPTED: string[] = [
  'BU İŞLETME DOLANDIRICI!!! 🤬',
  'Hepsi sahte yorum, kaçın!',
  'Asla gitmeyin berbat berbat',
  '1 yıldız bile fazla 💢',
  'Bot yorumlarla şişirilmiş',
  'Rezalet, herkese söylüyorum',
  'Para tuzağı, uzak durun',
  'Nefret ediyorum bu yerden',
];
const GENUINE: string[] = [
  'Servis çok güler yüzlüydü 😊',
  'Lezzetliydi, tekrar geleceğim',
  'Temiz ve ferah bir mekan',
  'Fiyat/performans harika',
  'Personel çok ilgiliydi 👍',
  'Tavsiye ederim, beğendik',
  'Ambiyans çok hoştu',
  'Hızlı ve kaliteli hizmet',
];
const POWER_LABEL: Record<PowerKind, string> = {
  freeze: '❄️ Zaman Dondur',
  double: '⭐ Çift Puan',
  heart: '💗 Can',
};

let _seq = 0;

export function MindThiefGame() {
  const game = useMiniGame('mind-thief');
  const [comments, setComments] = useState<FloatingComment[]>([]);
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [bossAngry, setBossAngry] = useState(false);
  const [rage, setRage] = useState(false);
  const [doubleLeft, setDoubleLeft] = useState(0);
  const [frozenLeft, setFrozenLeft] = useState(0);

  const livesRef = useRef(MAX_LIVES);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const rageRef = useRef(false);
  const frozenUntilRef = useRef(0);
  const doubleUntilRef = useRef(0);
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
      setComments([]);
      if (won) sfxWin();
      else sfxHit();
      void game.finish(scoreRef.current, won);
    },
    [game]
  );

  const loseLife = useCallback(
    (atPct?: { x: number; y: number }) => {
      setBossAngry(true);
      setTimeout(() => setBossAngry(false), 450);
      livesRef.current -= 1;
      setLives(livesRef.current);
      comboRef.current = 0;
      setCombo(0);
      sfxHit();
      haptic([20, 40, 20]);
      if (atPct) {
        const p = toPx(atPct.x, atPct.y);
        fxRef.current?.burst(p.x, p.y, '#f43f5e', 18);
        fxRef.current?.floatText(p.x, p.y, '-1 can', '#f43f5e');
      }
      if (livesRef.current <= 0) endGame(false);
    },
    [endGame, toPx]
  );

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    runningRef.current = true;
    livesRef.current = MAX_LIVES;
    scoreRef.current = 0;
    comboRef.current = 0;
    rageRef.current = false;
    frozenUntilRef.current = 0;
    doubleUntilRef.current = 0;
    setLives(MAX_LIVES);
    setScore(0);
    setCombo(0);
    setComments([]);
    setRage(false);
    setDoubleLeft(0);
    setFrozenLeft(0);
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const spawn = () => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - startedAt;
      const rageOn = rageRef.current;
      // Tür seç: öfkede daha çok bozuk; ara sıra power-up.
      const roll = Math.random();
      let kind: FloatingComment['kind'];
      if (roll < 0.06) {
        const powers: PowerKind[] = ['freeze', 'double', 'heart'];
        kind = powers[Math.floor(Math.random() * powers.length)];
      } else {
        const corruptChance = rageOn ? 0.75 : 0.5;
        kind = Math.random() < corruptChance ? 'corrupted' : 'genuine';
      }
      const text =
        kind === 'corrupted'
          ? CORRUPTED[Math.floor(Math.random() * CORRUPTED.length)]
          : kind === 'genuine'
          ? GENUINE[Math.floor(Math.random() * GENUINE.length)]
          : POWER_LABEL[kind as PowerKind];
      const c: FloatingComment = {
        id: ++_seq,
        text,
        kind,
        x: 10 + Math.random() * 74,
        y: 16 + Math.random() * 64,
        depth: Math.random(),
      };
      setComments((prev) => [...prev.slice(-8), c]);
      // Bozuk yorum yok edilmezse ağ enfekte olur → can. (Dondurulduğunda süre uzar.)
      const ttl = 3000 + (rageOn ? -500 : 0);
      setTimeout(() => {
        setComments((prev) => {
          const still = prev.find((p) => p.id === c.id);
          if (still && still.kind === 'corrupted' && runningRef.current && Date.now() > frozenUntilRef.current) {
            loseLife({ x: c.x, y: c.y });
          }
          return prev.filter((p) => p.id !== c.id);
        });
      }, ttl);
    };

    let spawnTimer: ReturnType<typeof setTimeout>;
    const scheduleSpawn = () => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - startedAt;
      const frozen = Date.now() < frozenUntilRef.current;
      // Hız: zamanla artar, öfkede daha hızlı, donduğunda durur.
      const base = Math.max(420, 1050 - (elapsed / ROUND_MS) * 520);
      const interval = frozen ? 1400 : rageRef.current ? base * 0.6 : base;
      spawn();
      spawnTimer = setTimeout(scheduleSpawn, interval);
    };
    scheduleSpawn();

    // Öfke modu döngüsü.
    const rageTimer = setInterval(() => {
      if (!runningRef.current) return;
      rageRef.current = true;
      setRage(true);
      setBossAngry(true);
      sfxPowerUp();
      const c = toPx(50, 45);
      fxRef.current?.shockwave(c.x, c.y, '#f43f5e', 220);
      setTimeout(() => {
        rageRef.current = false;
        setRage(false);
        setBossAngry(false);
      }, RAGE_DURATION_MS);
    }, RAGE_EVERY_MS);

    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setTimeLeft(Math.max(0, Math.round((ROUND_MS - elapsed) / 1000)));
      setFrozenLeft(Math.max(0, Math.ceil((frozenUntilRef.current - Date.now()) / 1000)));
      setDoubleLeft(Math.max(0, Math.ceil((doubleUntilRef.current - Date.now()) / 1000)));
      if (elapsed >= ROUND_MS) {
        clearInterval(tick);
        clearTimeout(spawnTimer);
        clearInterval(rageTimer);
        endGame(scoreRef.current >= DEF.rewardThreshold);
      }
    }, 200);

    return () => {
      clearTimeout(spawnTimer);
      clearInterval(rageTimer);
      clearInterval(tick);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const hitComment = useCallback(
    (c: FloatingComment) => {
      if (!runningRef.current) return;
      setComments((prev) => prev.filter((p) => p.id !== c.id));
      const p = toPx(c.x, c.y);

      if (c.kind === 'corrupted') {
        comboRef.current += 1;
        setCombo(comboRef.current);
        const mult = Date.now() < doubleUntilRef.current ? 2 : 1;
        // Kombo bonusu: her 5 komboda +1.
        const comboBonus = comboRef.current % 5 === 0 ? 1 : 0;
        const gain = (1 + comboBonus) * mult;
        scoreRef.current += gain;
        setScore(scoreRef.current);
        sfxCombo(comboRef.current);
        haptic(10);
        fxRef.current?.burst(p.x, p.y, DEF.accent, 22);
        fxRef.current?.ring(p.x, p.y, DEF.accent);
        fxRef.current?.floatText(p.x, p.y, gain > 1 ? `+${gain}` : '+1', '#c4b5fd');
        if (comboRef.current > 0 && comboRef.current % 5 === 0) {
          sfxFanfare();
          fxRef.current?.shockwave(p.x, p.y, '#fbbf24', 160);
          fxRef.current?.floatText(p.x, p.y - 36, `🔥 ${comboRef.current}x KOMBO!`, '#fcd34d');
        }
        if (scoreRef.current >= DEF.maxScore) endGame(true);
        return;
      }

      if (c.kind === 'genuine') {
        loseLife({ x: c.x, y: c.y });
        return;
      }

      // power-up toplandı
      sfxPowerUp();
      haptic([10, 30]);
      fxRef.current?.confettiAt(p.x, p.y, ['#22d3ee', '#a855f7', '#fbbf24'], 18);
      if (c.kind === 'freeze') {
        frozenUntilRef.current = Date.now() + 3500;
        fxRef.current?.floatText(p.x, p.y, '❄️ DONDU!', '#67e8f9');
      } else if (c.kind === 'double') {
        doubleUntilRef.current = Date.now() + 6000;
        fxRef.current?.floatText(p.x, p.y, '⭐ ÇİFT PUAN!', '#fcd34d');
      } else if (c.kind === 'heart') {
        if (livesRef.current < MAX_LIVES) {
          livesRef.current += 1;
          setLives(livesRef.current);
        }
        scoreRef.current += 1;
        setScore(scoreRef.current);
        fxRef.current?.floatText(p.x, p.y, '💗 +CAN', '#fb7185');
      }
    },
    [endGame, loseLife, toPx]
  );

  const cardStyle = (kind: FloatingComment['kind']) => {
    if (kind === 'corrupted')
      return {
        color: '#fecaca',
        background: 'linear-gradient(135deg, rgba(140,20,45,0.92), rgba(80,10,30,0.92))',
        borderColor: '#f43f5eaa',
        shadow: '0 8px 24px rgba(244,63,94,0.35), 0 0 18px #f43f5e55',
      };
    if (kind === 'genuine')
      return {
        color: '#bbf7d0',
        background: 'linear-gradient(135deg, rgba(16,90,58,0.9), rgba(8,50,34,0.9))',
        borderColor: '#34d399aa',
        shadow: '0 8px 24px rgba(52,211,153,0.3), 0 0 18px #34d39955',
      };
    return {
      color: '#e9d5ff',
      background: 'linear-gradient(135deg, rgba(67,56,202,0.92), rgba(124,58,237,0.85))',
      borderColor: '#c4b5fdcc',
      shadow: '0 8px 28px rgba(167,139,250,0.5), 0 0 22px #a78bfa88',
    };
  };

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
            <Motion.span key={i} animate={i >= lives ? { scale: [1.4, 1] } : {}}>
              <Heart className="h-5 w-5" style={{ color: i < lives ? '#f43f5e' : '#3f3f46', fill: i < lives ? '#f43f5e' : 'transparent' }} />
            </Motion.span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Motion.div key={score} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
            <Zap className="h-4 w-4" /> {score}
          </Motion.div>
          <AnimatePresence>
            {combo >= 3 && (
              <Motion.span key={combo} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-0.5 font-bold text-orange-400">
                <Flame className="h-3.5 w-3.5" />{combo}x
              </Motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</div>
      </div>

      {/* Aktif power-up rozetleri */}
      <div className="mb-2 flex h-5 items-center justify-center gap-2 text-[11px] font-bold">
        {frozenLeft > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-cyan-300"><Snowflake className="h-3 w-3" /> {frozenLeft}s</span>
        )}
        {doubleLeft > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-300"><Star className="h-3 w-3" /> Çift {doubleLeft}s</span>
        )}
        {rage && (
          <Motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 0.6, repeat: Infinity }} className="flex items-center gap-1 rounded-full bg-rose-500/30 px-2 py-0.5 text-rose-300"><Flame className="h-3 w-3" /> ÖFKE MODU</Motion.span>
        )}
      </div>

      {/* Arena */}
      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl"
        style={{
          height: ARENA_H,
          perspective: '900px',
          background: 'radial-gradient(circle at 50% 42%, #2a0f52 0%, #12082b 45%, #050210 80%)',
        }}
      >
        {/* Öfke vinyeti */}
        <AnimatePresence>
          {rage && (
            <Motion.div
              key="rage-vignette"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-20"
              style={{ boxShadow: 'inset 0 0 90px rgba(244,63,94,0.5)' }}
            />
          )}
        </AnimatePresence>

        {/* Donma overlay */}
        <AnimatePresence>
          {frozenLeft > 0 && (
            <Motion.div key="freeze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 z-20" style={{ background: 'radial-gradient(circle, rgba(103,232,249,0.1), rgba(103,232,249,0.04))', boxShadow: 'inset 0 0 70px rgba(103,232,249,0.3)' }} />
          )}
        </AnimatePresence>

        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #c4b5fd, transparent), radial-gradient(1px 1px at 40% 80%, #fff, transparent), radial-gradient(1px 1px at 85% 20%, #a855f7, transparent)', backgroundSize: '200px 200px' }} />

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Boss3D color={rage ? '#f43f5e' : DEF.accent} angry={bossAngry} size={240} />
        </div>

        <AnimatePresence>
          {comments.map((c) => {
            const scale = 0.78 + c.depth * 0.4;
            const z = -120 + c.depth * 220;
            const st = cardStyle(c.kind);
            const isPower = c.kind === 'freeze' || c.kind === 'double' || c.kind === 'heart';
            return (
              <Motion.button
                key={c.id}
                type="button"
                onClick={() => hitComment(c)}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale, y: [0, -6, 0] }}
                exit={{ opacity: 0, scale: 0.2, rotateZ: 25 }}
                transition={{ opacity: { duration: 0.2 }, scale: { type: 'spring', stiffness: 240, damping: 18 }, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
                className="absolute max-w-[168px] cursor-pointer rounded-xl border px-3 py-2 text-left text-[11px] font-medium leading-tight backdrop-blur-sm"
                style={{
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  transform: `translate(-50%, -50%) translateZ(${z}px)`,
                  transformStyle: 'preserve-3d',
                  color: st.color,
                  background: st.background,
                  borderColor: st.borderColor,
                  boxShadow: st.shadow,
                }}
                whileHover={{ scale: scale * 1.1 }}
                whileTap={{ scale: scale * 0.85 }}
              >
                {isPower ? <span className="font-bold">{c.text}</span> : c.text}
              </Motion.button>
            );
          })}
        </AnimatePresence>

        <FxLayer ref={fxRef} />

        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center text-[10px] text-white/40">
          🔴 Bozuk yok et · 🟢 Gerçeğe dokunma · 🟣 power-up topla
        </div>
      </div>
    </GameShell>
  );
}
