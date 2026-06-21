'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Heart, FileText, Flame, Timer } from 'lucide-react';
import { GameShell } from './game-shell';
import { FxLayer, type FxHandle } from './fx-layer';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxPowerUp, sfxWin, sfxCombo, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('review-detective')!;
const MAX_LIVES = 3;
const TOTAL_ROUNDS = 10;
const ROUND_TIME_MS = 9000;
const FAST_BONUS_MS = 3500; // bu süreden hızlı bulursan hız bonusu

interface Review {
  id: number;
  text: string;
  fake: boolean;
}

const REAL_POOL: string[] = [
  'Garson çok ilgiliydi, çorba sıcacıktı. Tatlı biraz şekerliydi ama genel olarak memnunuz.',
  'Otopark dardı, 10 dakika bekledik. Yemekler taze ve porsiyonlar doyurucuydu.',
  'Manzara güzeldi, fiyatlar biraz yüksek ama özel günler için ideal bir mekan.',
  'Kahve sıcak gelmedi ama personel hemen değiştirdi. İlgi için teşekkürler.',
  'Çocuk menüsü vardı, ailecek rahat ettik. Tuvaletler temizdi.',
  'Rezervasyon yaptırmadan gittik, 15 dk bekledik. Pizza hamuru çok iyiydi.',
  'Tatlısı ev yapımı tadındaydı, çay servisi de hızlıydı. Memnun ayrıldık.',
  'Gürültülü bir akşamdı ama yemekler sıcak ve lezzetliydi, fiyatı uygundu.',
  'Personel siparişi karıştırdı ama özür dileyip düzelttiler, tavrı olgundu.',
  'Konum biraz uzak ama gidince pişman olmadık, kahvaltı zengindi.',
];
const FAKE_POOL: string[] = [
  'MÜKEMMEL!!! EN İYİSİ!!! HERKES GİTMELİ %100 TAVSİYE EDERİM KESİNLİKLE!!!',
  'Harika harika harika süper süper en iyi en iyi mükemmel mükemmel 5 yıldız',
  'İndirim için profilime bakın link bio da kazançlı fırsat kaçmaz 🎁🔥💯',
  'Bu işletme efsane olağanüstü inanılmaz kusursuz hiç kusuru yok tam not',
  'Bedava kupon kodu DM at hemen kazan fırsatı kaçırma acele et 🚀🚀',
  'En iyi en iyi en iyi 10 yıldız verirdim sınırsız tavsiye sonsuz puan',
];

let _seq = 0;
function buildRound(roundIdx: number): Review[] {
  // Tur ilerledikçe daha çok seçenek (zorluk).
  const count = Math.min(6, 3 + Math.floor(roundIdx / 3) + Math.floor(Math.random() * 2));
  const reals = [...REAL_POOL].sort(() => Math.random() - 0.5).slice(0, count - 1);
  const fake = FAKE_POOL[Math.floor(Math.random() * FAKE_POOL.length)];
  const items: Review[] = [
    ...reals.map((t) => ({ id: ++_seq, text: t, fake: false })),
    { id: ++_seq, text: fake, fake: true },
  ];
  return items.sort(() => Math.random() - 0.5);
}

export function ReviewDetectiveGame() {
  const game = useMiniGame('review-detective');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [picked, setPicked] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_TIME_MS / 1000));
  const [combo, setCombo] = useState(0);

  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const roundRef = useRef(0);
  const comboRef = useRef(0);
  const roundStartRef = useRef(0);
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
    setReviews(buildRound(roundRef.current));
    setPicked(null);
    lockRef.current = false;
    roundStartRef.current = Date.now();
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

  // Tur süresi turlarla kısalır (zorluk).
  const roundTimeMs = Math.max(5000, ROUND_TIME_MS - roundRef.current * 350);
  // Tur geri sayımı: süre biterse can kaybı + sonraki tur.
  useEffect(() => {
    if (!playing || lockRef.current || reviews.length === 0) return;
    const startedAt = Date.now();
    const t = setInterval(() => {
      const remain = Math.max(0, Math.round((roundTimeMs - (Date.now() - startedAt)) / 1000));
      setTimeLeft(remain);
      if (remain <= 0) {
        clearInterval(t);
        if (!lockRef.current) {
          lockRef.current = true;
          comboRef.current = 0;
          setCombo(0);
          livesRef.current -= 1;
          setLives(livesRef.current);
          sfxBoom();
          haptic(20);
          setTimeout(nextRound, 900);
        }
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, playing]);

  const pick = useCallback(
    (r: Review, e: React.MouseEvent) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setPicked(r.id);
      const rect = arenaRef.current?.getBoundingClientRect();
      const px = rect ? e.clientX - rect.left : 0;
      const py = rect ? e.clientY - rect.top : 0;
      if (r.fake) {
        comboRef.current += 1;
        setCombo(comboRef.current);
        // Hızlı bulma bonusu + kombo bonusu.
        const fast = Date.now() - roundStartRef.current < FAST_BONUS_MS;
        const comboBonus = comboRef.current % 3 === 0 ? 1 : 0;
        const gain = 1 + (fast ? 1 : 0) + comboBonus;
        scoreRef.current += gain;
        setScore(scoreRef.current);
        sfxCombo(comboRef.current);
        haptic(10);
        fxRef.current?.burst(px, py, DEF.accent, 26);
        fxRef.current?.ring(px, py, DEF.accent);
        fxRef.current?.floatText(px, py, `Sahte! +${gain}`, '#fcd34d');
        if (fast) fxRef.current?.floatText(px + 30, py + 18, '⚡ HIZLI!', '#7dd3fc');
        if (comboRef.current > 0 && comboRef.current % 3 === 0) {
          sfxFanfare();
          fxRef.current?.shockwave(px, py, DEF.accent, 160);
          fxRef.current?.confettiAt(px, py, ['#f59e0b', '#fbbf24', '#22d3ee'], 18);
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
        fxRef.current?.burst(px, py, '#f43f5e', 20);
        fxRef.current?.shockwave(px, py, '#f43f5e', 150);
        fxRef.current?.floatText(px, py, 'Yanlış ipucu! -1', '#fca5a5');
      }
      setTimeout(nextRound, 1100);
    },
    [nextRound, endGame]
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
          <span>Dosya {round}/{TOTAL_ROUNDS}</span>
          {combo >= 2 && (
            <span className="flex items-center gap-0.5 font-bold text-orange-400"><Flame className="h-3.5 w-3.5" />{combo}x</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" style={{ color: DEF.accent }}><Search className="h-4 w-4" /> {score}</span>
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs tabular-nums text-white/80"><Timer className="h-3 w-3" />{timeLeft}s</span>
        </div>
      </div>

      <div
        ref={arenaRef}
        className="relative w-full overflow-hidden rounded-2xl p-4"
        style={{
          perspective: '1000px',
          background: 'radial-gradient(circle at 50% 20%, #3a2a0a 0%, #1c1405 45%, #0a0803 85%)',
        }}
      >
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300/70">
          <FileText className="h-4 w-4" /> Vaka Dosyası — sahte yorumu bul
        </div>

        <div className="space-y-2.5" style={{ transformStyle: 'preserve-3d' }}>
          <AnimatePresence mode="popLayout">
            {reviews.map((r, i) => {
              const revealed = picked !== null;
              const isFake = r.fake;
              return (
                <motion.button
                  key={r.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, rotateX: -40, y: 14 }}
                  animate={{ opacity: 1, rotateX: 0, y: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ delay: i * 0.08, type: 'spring', stiffness: 180, damping: 18 }}
                  onClick={(e) => pick(r, e)}
                  whileHover={{ scale: 1.02, x: 4 }}
                  className="group relative block w-full rounded-xl border p-3 text-left text-[12px] leading-snug text-white/90"
                  style={{
                    transformStyle: 'preserve-3d',
                    borderColor: revealed ? (isFake ? '#f59e0b' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.14)',
                    background: revealed && isFake
                      ? 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(120,80,5,0.2))'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                    boxShadow: revealed && isFake ? `0 0 22px ${DEF.accent}66` : '0 4px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  {/* büyüteç ikonu hover'da */}
                  <Search className="absolute right-3 top-3 h-4 w-4 text-amber-300/0 transition-colors group-hover:text-amber-300/70" />
                  {r.text}
                  {revealed && isFake && (
                    <span className="mt-1.5 block text-[10px] font-bold text-amber-300">⚠ YAPAY / SAHTE</span>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        <FxLayer ref={fxRef} />
        <p className="mt-3 text-center text-[10px] text-white/40">🔍 Aşırı abartı, tekrar ve spam-link sahteyi ele verir.</p>
      </div>
    </GameShell>
  );
}
