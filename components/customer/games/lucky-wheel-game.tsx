'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Target, Zap } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { sfxCollectStar, sfxHit, sfxPowerUp, sfxWin, sfxFanfare, haptic } from '@/lib/game-sounds';

function reducedMotion() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-animations');
}

const DEF = getMiniGame('lucky-wheel')!;
const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 140;
const TOTAL_SPINS = 8; // 8 deneme
const ROUND_MS = 45_000;

// Dilimler: yeşil (büyük ödül), sarı (küçük), kırmızı (ceza/0)
const SEGMENTS = [
  { color: '#22c55e', glow: '#22c55e', reward: 3, label: '+3' },
  { color: '#ef4444', glow: '#ef4444', reward: 0, label: 'X' },
  { color: '#eab308', glow: '#eab308', reward: 1, label: '+1' },
  { color: '#ef4444', glow: '#ef4444', reward: 0, label: 'X' },
  { color: '#22c55e', glow: '#22c55e', reward: 3, label: '+3' },
  { color: '#eab308', glow: '#eab308', reward: 1, label: '+1' },
  { color: '#ef4444', glow: '#ef4444', reward: 0, label: 'X' },
  { color: '#eab308', glow: '#eab308', reward: 1, label: '+1' },
];
const SEG = (Math.PI * 2) / SEGMENTS.length;

export function LuckyWheelGame() {
  const game = useMiniGame('lucky-wheel');
  const [score, setScore] = useState(0);
  const [spinsLeft, setSpinsLeft] = useState(TOTAL_SPINS);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef(0);
  const velRef = useRef(0);
  const spinningRef = useRef(false);
  const scoreRef = useRef(0);
  const spinsRef = useRef(TOTAL_SPINS);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const playing = game.phase === 'playing';

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

  // Pointer (üst, -90°) hangi dilimde?
  const resolveSegment = useCallback(() => {
    const a = ((-Math.PI / 2 - angleRef.current) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.floor(a / SEG) % SEGMENTS.length;
    return SEGMENTS[idx];
  }, []);

  const spin = useCallback(() => {
    if (!runningRef.current || spinningRef.current || spinsRef.current <= 0) return;
    spinningRef.current = true;
    velRef.current = 0.35 + Math.random() * 0.18; // başlangıç hızı
    sfxPowerUp();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let mountRaf = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      mountRaf = requestAnimationFrame(() => setRetry((r) => r + 1));
      return () => cancelAnimationFrame(mountRaf);
    }

    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = 0;
    spinsRef.current = TOTAL_SPINS;
    angleRef.current = 0;
    velRef.current = 0;
    spinningRef.current = false;
    setScore(0);
    setSpinsLeft(TOTAL_SPINS);
    setLastWin(null);
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const loop = () => {
      // fizik
      if (spinningRef.current) {
        angleRef.current += velRef.current;
        velRef.current *= 0.985; // sürtünme
        if (velRef.current < 0.004) {
          spinningRef.current = false;
          velRef.current = 0;
          const seg = resolveSegment();
          spinsRef.current -= 1;
          setSpinsLeft(spinsRef.current);
          if (seg.reward > 0) {
            scoreRef.current += seg.reward;
            setScore(scoreRef.current);
            setLastWin(`${seg.label} puan!`);
            // Büyük ödül (yeşil) → fanfare + konfeti.
            if (seg.reward >= 3) {
              sfxFanfare();
              haptic([10, 30, 10]);
              if (!reducedMotion()) {
                confetti({ particleCount: 70, spread: 70, origin: { y: 0.5 }, colors: ['#84cc16', '#22c55e', '#fbbf24'] });
              }
            } else {
              sfxCollectStar(scoreRef.current % 6);
              haptic(10);
            }
          } else {
            setLastWin('Boş — tekrar dene!');
            sfxHit();
            haptic([20, 40]);
          }
          if (scoreRef.current >= DEF.maxScore) { endGame(true); return; }
          if (spinsRef.current <= 0) { endGame(scoreRef.current >= DEF.rewardThreshold); return; }
        }
      }

      // çiz
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(angleRef.current);
      for (let i = 0; i < SEGMENTS.length; i++) {
        const s = SEGMENTS[i];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, i * SEG, (i + 1) * SEG);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.glow; ctx.shadowBlur = spinningRef.current ? 14 : 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        // etiket
        ctx.save();
        ctx.rotate(i * SEG + SEG / 2);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.label, R * 0.66, 0);
        ctx.restore();
      }
      ctx.restore();

      // merkez göbek
      ctx.beginPath(); ctx.arc(CX, CY, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a'; ctx.fill();
      ctx.strokeStyle = DEF.accent; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '20px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🎰', CX, CY);

      // pointer (üstte)
      ctx.beginPath();
      ctx.moveTo(CX - 12, 8); ctx.lineTo(CX + 12, 8); ctx.lineTo(CX, 30);
      ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.shadowColor = DEF.accent; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;

      const elapsed = Date.now() - startedAt;
      if (elapsed >= ROUND_MS) { endGame(scoreRef.current >= DEF.rewardThreshold); return; }
      setTimeLeft(Math.max(0, Math.round((ROUND_MS - elapsed) / 1000)));
      if (runningRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, retry]);

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
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs text-white/80">Hak: {spinsLeft}</div>
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}><Zap className="h-4 w-4" /> {score}</div>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</div>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-2xl p-4" style={{ background: 'radial-gradient(circle at 50% 35%, #1a2e05 0%, #0c1602 55%, #050803 85%)' }}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} className="max-w-full" />
        <div className="h-5 text-sm font-bold" style={{ color: DEF.accent }}>{lastWin}</div>
        <button
          onClick={spin}
          disabled={spinsLeft <= 0}
          className="flex items-center gap-2 rounded-xl px-8 py-3 text-base font-bold text-black transition active:scale-95 disabled:opacity-40"
          style={{ background: DEF.accent, boxShadow: `0 0 24px ${DEF.accent}88` }}
        >
          <Target className="h-5 w-5" /> Çevir!
        </button>
        <p className="text-center text-[10px] text-white/40">🟢 +3 · 🟡 +1 · 🔴 boş. {DEF.rewardThreshold}+ puanla ödülü kap!</p>
      </div>
    </GameShell>
  );
}
