'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Check, X, Flame, Clock, Star } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxHit, sfxWin, sfxCombo, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('truth-vs-fake')!;
const ROUND_MS = 45_000;
const ARENA_H = 420;
const TIME_BONUS_MS = 1200; // doğru cevapta eklenen süre

type Special = 'golden' | 'bomb' | null;
interface Card {
  id: number;
  text: string;
  fake: boolean;
  special: Special;
}

const FAKE: string[] = [
  'Bu ürün hayatımı değiştirdi!!! 5 yıldız kesinlikle %100 mükemmel herkes almalı',
  'Harika harika harika harika en iyisi bu',
  'asdf çok güzel link: bit.ly/indirim kazandınız tıklayın',
  'AI tarafından üretildiği belli olan kusursuz aşırı genel yorum',
  'Mükemmel! Olağanüstü! İnanılmaz! Efsane! (hiç detay yok)',
  'Bedava hediye için profilimi ziyaret edin 🎁🎁🎁',
];
const REAL: string[] = [
  'Tatlılar güzeldi ama servis biraz yavaştı, yine de memnun kaldık.',
  'Kahvaltı tabağı doyurucuydu, fiyatı da makul. Tekrar gideriz.',
  'Park sorunu var ama yemekler taze, garson ilgiliydi.',
  'Pizza hamuru incedir, beklediğimden lezzetliydi.',
  'Mekan kalabalıktı, 15 dk bekledik ama buna değdi.',
  'Tatlı menüsü sınırlı ama ana yemekler başarılı.',
];

let _seq = 0;
function makeCard(): Card {
  const fake = Math.random() < 0.5;
  const pool = fake ? FAKE : REAL;
  // %15 altın (çift puan), %12 bomba (yanlışta ekstra ceza).
  const roll = Math.random();
  const special: Special = roll < 0.15 ? 'golden' : roll < 0.27 ? 'bomb' : null;
  return { id: ++_seq, text: pool[Math.floor(Math.random() * pool.length)], fake, special };
}

export function TruthVsFakeGame() {
  const game = useMiniGame('truth-vs-fake');
  const [deck, setDeck] = useState<Card[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const [flyOut, setFlyOut] = useState<{ dir: number; correct: boolean } | null>(null);

  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const deadlineRef = useRef(0); // dinamik bitiş zamanı (süre bonusu ekler)
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<FxHandle>(null);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-20, 20]);
  const realOpacity = useTransform(x, [20, 120], [0, 1]);
  const fakeOpacity = useTransform(x, [-120, -20], [1, 0]);

  const playing = game.phase === 'playing';
  const top = deck[0];

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

  useEffect(() => {
    if (!playing) return;
    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = 0;
    comboRef.current = 0;
    setScore(0);
    setCombo(0);
    setDeck([makeCard(), makeCard(), makeCard(), makeCard()]);
    deadlineRef.current = Date.now() + ROUND_MS;
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const tick = setInterval(() => {
      const remainMs = deadlineRef.current - Date.now();
      setTimeLeft(Math.max(0, Math.ceil(remainMs / 1000)));
      if (remainMs <= 0) {
        clearInterval(tick);
        endGame(scoreRef.current >= DEF.rewardThreshold);
      }
    }, 200);

    return () => {
      clearInterval(tick);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const center = useCallback(() => {
    const el = arenaRef.current;
    return { x: (el?.clientWidth ?? 300) / 2, y: (el?.clientHeight ?? ARENA_H) / 2 };
  }, []);

  // judgedFake: oyuncu "sahte" dediyse true (sola), "gerçek" dediyse false (sağa)
  const judge = useCallback(
    (judgedFake: boolean) => {
      if (!runningRef.current || !top) return;
      const correct = judgedFake === top.fake;
      const special = top.special;
      const c = center();
      if (correct) {
        comboRef.current += 1;
        const next = comboRef.current;
        setCombo(next);
        // Altın kart çift puan; kombo milestone (her 5) +1.
        const goldMult = special === 'golden' ? 2 : 1;
        const milestone = next % 5 === 0;
        const gain = (1 + (milestone ? 1 : 0)) * goldMult;
        scoreRef.current += gain;
        setScore(scoreRef.current);
        // Doğru cevap süreye bonus ekler (akış hissi).
        deadlineRef.current += TIME_BONUS_MS;
        setFlash('right');
        sfxCombo(next);
        haptic(8);
        fxRef.current?.burst(c.x, c.y, special === 'golden' ? '#fbbf24' : '#34d399', 26);
        fxRef.current?.ring(c.x, c.y, special === 'golden' ? '#fbbf24' : '#34d399');
        fxRef.current?.floatText(c.x, c.y - 20, gain > 1 ? `+${gain}` : '+1', special === 'golden' ? '#fcd34d' : '#6ee7b7');
        fxRef.current?.floatText(c.x + 36, c.y, `+${(TIME_BONUS_MS / 1000).toFixed(1)}s`, '#7dd3fc');
        if (milestone) {
          sfxFanfare();
          fxRef.current?.shockwave(c.x, c.y, '#fbbf24', 170);
          fxRef.current?.confettiAt(c.x, c.y, ['#fbbf24', '#34d399', '#22d3ee'], 22);
          fxRef.current?.floatText(c.x, c.y - 44, `🔥 ${next}x ATEŞ!`, '#fcd34d');
        }
        if (scoreRef.current >= DEF.maxScore) {
          endGame(true);
          return;
        }
      } else {
        comboRef.current = 0;
        setCombo(0);
        setFlash('wrong');
        // Bomba kartı yanlış işaretlersen ekstra süre cezası + boom.
        if (special === 'bomb') {
          deadlineRef.current -= 4000;
          sfxBoom();
          haptic([30, 50, 30]);
          fxRef.current?.shockwave(c.x, c.y, '#f43f5e', 200);
          fxRef.current?.burst(c.x, c.y, '#f43f5e', 30);
          fxRef.current?.floatText(c.x, c.y - 20, '💣 -4s!', '#fca5a5');
        } else {
          sfxHit();
          haptic(20);
          fxRef.current?.burst(c.x, c.y, '#f43f5e', 16);
          fxRef.current?.floatText(c.x, c.y - 20, 'Yanlış', '#fca5a5');
        }
      }
      setTimeout(() => setFlash(null), 220);
      setFlyOut({ dir: judgedFake ? -1 : 1, correct });
      x.set(0);
      // Kartı destenin başından çıkar, sona yeni ekle (uçuş animasyonundan sonra).
      setTimeout(() => {
        setDeck((prev) => [...prev.slice(1), makeCard()]);
        setFlyOut(null);
      }, 240);
    },
    [top, x, endGame, center]
  );

  const onDragEnd = useCallback(
    (_e: unknown, info: { offset: { x: number } }) => {
      if (info.offset.x > 90) judge(false);
      else if (info.offset.x < -90) judge(true);
      else x.set(0);
    },
    [judge, x]
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
      {/* HUD */}
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <motion.div key={score} initial={{ scale: 1.3 }} animate={{ scale: 1 }} style={{ color: DEF.accent }}>
          Skor: {score}
        </motion.div>
        <AnimatePresence>
          {combo >= 2 && (
            <motion.div
              key={combo}
              initial={{ scale: 0.4, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 font-bold text-amber-400"
              style={{ textShadow: '0 0 12px rgba(251,191,36,0.7)' }}
            >
              <Flame className="h-4 w-4" /> {combo}x KOMBO!
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">
          <Clock className="h-3 w-3" /> {timeLeft}s
        </div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl"
        style={{
          height: ARENA_H,
          perspective: '1100px',
          background: 'radial-gradient(circle at 50% 28%, #06314a 0%, #041326 50%, #03060f 85%)',
          boxShadow:
            flash === 'right'
              ? 'inset 0 0 70px rgba(52,211,153,0.4)'
              : flash === 'wrong'
              ? 'inset 0 0 70px rgba(244,63,94,0.4)'
              : 'none',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Etiketler */}
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-lg bg-rose-500/20 px-2 py-1 text-xs font-bold text-rose-300">
          ◀ SAHTE
        </div>
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300">
          GERÇEK ▶
        </div>

        {/* 3D kart yığını */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
          {deck.slice(0, 4).map((card, i) => {
            if (i === 0) {
              return (
                <motion.div
                  key={card.id}
                  drag={flyOut ? false : 'x'}
                  style={{ x, rotate, transformStyle: 'preserve-3d' }}
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragEnd={onDragEnd}
                  animate={
                    flyOut
                      ? {
                          x: flyOut.dir * 520,
                          rotateZ: flyOut.dir * 35,
                          opacity: 0,
                        }
                      : {}
                  }
                  transition={{ duration: 0.24, ease: 'easeIn' }}
                  whileTap={{ cursor: 'grabbing' }}
                  className="absolute z-10 flex h-[270px] w-[270px] cursor-grab flex-col justify-between rounded-2xl border border-white/15 p-5 shadow-2xl"
                  initial={false}
                >
                  <div
                    className="absolute inset-0 -z-10 rounded-2xl"
                    style={{
                      background:
                        card.special === 'golden'
                          ? 'linear-gradient(150deg, #3f2d08 0%, #1a1304 100%)'
                          : card.special === 'bomb'
                          ? 'linear-gradient(150deg, #3a1118 0%, #1a0608 100%)'
                          : 'linear-gradient(150deg, #1e293b 0%, #0f172a 100%)',
                      boxShadow:
                        card.special === 'golden'
                          ? '0 24px 50px -12px rgba(0,0,0,0.7), 0 0 36px rgba(251,191,36,0.4)'
                          : card.special === 'bomb'
                          ? '0 24px 50px -12px rgba(0,0,0,0.7), 0 0 36px rgba(244,63,94,0.4)'
                          : '0 24px 50px -12px rgba(0,0,0,0.7), 0 0 30px rgba(34,211,238,0.1)',
                      border:
                        card.special === 'golden'
                          ? '2px solid #fbbf24aa'
                          : card.special === 'bomb'
                          ? '2px solid #f43f5eaa'
                          : 'none',
                    }}
                  />
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/40">
                    <span>⭐ Yorum</span>
                    {card.special === 'golden' && (
                      <motion.span animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1, repeat: Infinity }} className="flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] text-amber-300">
                        <Star className="h-3 w-3" /> ÇİFT PUAN
                      </motion.span>
                    )}
                    {card.special === 'bomb' && (
                      <span className="rounded-full bg-rose-500/25 px-2 py-0.5 text-[10px] text-rose-300">💣 DİKKAT</span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-snug text-white">{card.text}</p>
                  <div className="text-[10px] text-white/30">Kaydır veya butonları kullan</div>

                  <motion.div
                    style={{ opacity: fakeOpacity }}
                    className="absolute -left-1 top-5 rotate-[-12deg] rounded-lg border-2 border-rose-400 px-2 py-0.5 text-base font-black text-rose-400"
                  >
                    SAHTE
                  </motion.div>
                  <motion.div
                    style={{ opacity: realOpacity }}
                    className="absolute -right-1 top-5 rotate-[12deg] rounded-lg border-2 border-emerald-400 px-2 py-0.5 text-base font-black text-emerald-400"
                  >
                    GERÇEK
                  </motion.div>
                </motion.div>
              );
            }
            // Arka kartlar — 3D derinlikli yığın
            return (
              <div
                key={card.id}
                className="absolute h-[270px] w-[270px] rounded-2xl border border-white/10"
                style={{
                  background: 'linear-gradient(150deg, #172033, #0b1220)',
                  transform: `translateY(${i * 14}px) translateZ(${-i * 70}px) scale(${1 - i * 0.04})`,
                  opacity: 1 - i * 0.18,
                  zIndex: -i,
                }}
              />
            );
          })}
        </div>

        {/* FX */}
        <FxLayer ref={fxRef} />

        {/* Butonlar */}
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-6">
          <motion.button
            whileTap={{ scale: 0.82 }}
            whileHover={{ scale: 1.08 }}
            onClick={() => judge(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 ring-2 ring-rose-500/60"
            style={{ boxShadow: '0 0 20px rgba(244,63,94,0.4)' }}
          >
            <X className="h-7 w-7" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.82 }}
            whileHover={{ scale: 1.08 }}
            onClick={() => judge(false)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/60"
            style={{ boxShadow: '0 0 20px rgba(52,211,153,0.4)' }}
          >
            <Check className="h-7 w-7" />
          </motion.button>
        </div>
      </div>
    </GameShell>
  );
}
