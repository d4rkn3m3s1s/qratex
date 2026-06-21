'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, ShieldCheck, Flame } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxWin, sfxCombo, sfxPowerUp, sfxFanfare, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('guardian-of-trust')!;
const W = 360;
const H = 440;
const MAX_LIVES = 3;
const ROUND_MS = 50_000;
const FLOOR = H - 30;

type DropKind = 'good' | 'bad' | 'slow' | 'big';
type Drop = { x: number; y: number; vy: number; kind: DropKind; r: number; emoji: string };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string };
type Wave = { r: number; life: number };

function reduced() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-animations');
}

const GOOD_EMOJI = ['😊', '👍', '⭐', '💚', '🙌'];
const BAD_EMOJI = ['💢', '🤬', '👎', '☠️'];

export function GuardianOfTrustGame() {
  const game = useMiniGame('guardian-of-trust');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [combo, setCombo] = useState(0);
  const [retry, setRetry] = useState(0); // canvas mount retry tetikleyici

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dropsRef = useRef<Drop[]>([]);
  const partsRef = useRef<Particle[]>([]);
  const wavesRef = useRef<Wave[]>([]);
  const shieldRef = useRef({ x: W / 2, active: false });
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const comboRef = useRef(0);
  const shieldWidthUntilRef = useRef(0); // büyük kalkan power süresi
  const slowUntilRef = useRef(0); // yavaşlatma power süresi
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

  const burst = useCallback((x: number, y: number, c: string, n: number) => {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      partsRef.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 22, max: 22, c });
    }
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
    livesRef.current = MAX_LIVES;
    comboRef.current = 0;
    shieldWidthUntilRef.current = 0;
    slowUntilRef.current = 0;
    dropsRef.current = [];
    partsRef.current = [];
    wavesRef.current = [];
    setScore(0);
    setLives(MAX_LIVES);
    setCombo(0);
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const spawn = () => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - startedAt;
      const roll = Math.random();
      let kind: DropKind;
      if (roll < 0.05) kind = 'big';
      else if (roll < 0.1) kind = 'slow';
      else kind = Math.random() < 0.5 ? 'good' : 'bad';
      const emoji =
        kind === 'good' ? GOOD_EMOJI[Math.floor(Math.random() * GOOD_EMOJI.length)]
        : kind === 'bad' ? BAD_EMOJI[Math.floor(Math.random() * BAD_EMOJI.length)]
        : kind === 'big' ? '🛡️' : '⏳';
      dropsRef.current.push({
        x: 30 + Math.random() * (W - 60),
        y: -20,
        vy: 1 + Math.random() * 1.2 + (elapsed / ROUND_MS) * 1.4,
        kind,
        r: 16,
        emoji,
      });
    };

    let spawnAcc = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      spawnAcc += dt;
      const elapsed = Date.now() - startedAt;
      const every = Math.max(520, 1000 - (elapsed / ROUND_MS) * 480);
      if (spawnAcc > every) { spawnAcc = 0; spawn(); }

      const slowMul = Date.now() < slowUntilRef.current ? 0.45 : 1;
      for (const d of dropsRef.current) d.y += d.vy * (dt / 16) * slowMul;

      // tabana ulaşanlar (power-up'lar yere değince kaybolur, ödül değil)
      const landed = dropsRef.current.filter((d) => d.y >= FLOOR);
      if (landed.length) {
        dropsRef.current = dropsRef.current.filter((d) => d.y < FLOOR);
        for (const d of landed) {
          if (d.kind === 'good') {
            // iyi yorum güvenle yere indi → puan + kombo
            comboRef.current += 1;
            setCombo(comboRef.current);
            const comboBonus = comboRef.current % 5 === 0 ? 1 : 0;
            scoreRef.current += 1 + comboBonus;
            setScore(scoreRef.current);
            sfxCombo(comboRef.current);
            burst(d.x, FLOOR, '#34d399', 12);
            if (comboRef.current > 0 && comboRef.current % 5 === 0) sfxFanfare();
            if (scoreRef.current >= DEF.maxScore) { endGame(true); return; }
          } else if (d.kind === 'bad') {
            // bozuk yorum güveni enfekte etti → can + kombo kırılır
            comboRef.current = 0;
            setCombo(0);
            livesRef.current -= 1;
            setLives(Math.max(0, livesRef.current));
            sfxHit();
            haptic([20, 40]);
            burst(d.x, FLOOR, '#f43f5e', 16);
            if (livesRef.current <= 0) { endGame(false); return; }
          }
          // power-up'lar yere düşerse kaçırılmış sayılır (etkisiz)
        }
      }

      // kalkan dalgaları
      for (const wv of wavesRef.current) { wv.r += 7; wv.life -= 1; }
      wavesRef.current = wavesRef.current.filter((w) => w.life > 0);

      for (const p of partsRef.current) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 1; }
      partsRef.current = partsRef.current.filter((p) => p.life > 0);

      // çiz
      ctx.clearRect(0, 0, W, H);
      // arka ışık huzmesi
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, 'rgba(255,255,255,0.06)');
      bg.addColorStop(1, 'rgba(251,191,36,0.04)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // güven tabanı
      ctx.fillStyle = `${DEF.accent}33`;
      ctx.fillRect(0, FLOOR + 8, W, H - FLOOR);
      ctx.strokeStyle = DEF.accent;
      ctx.lineWidth = 2;
      ctx.shadowColor = DEF.accent; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(0, FLOOR + 8); ctx.lineTo(W, FLOOR + 8); ctx.stroke();
      ctx.shadowBlur = 0;

      // kalkan dalgaları
      for (const wv of wavesRef.current) {
        const a = wv.life / 22;
        ctx.strokeStyle = `rgba(253,230,138,${a * 0.8})`;
        ctx.lineWidth = 4 * a + 1;
        ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(shieldRef.current.x, FLOOR - 26, wv.r, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // düşenler
      for (const d of dropsRef.current) {
        ctx.save();
        const glow = d.kind === 'bad' ? '#f43f5e' : d.kind === 'good' ? '#34d399' : '#fbbf24';
        ctx.shadowColor = glow; ctx.shadowBlur = d.kind === 'good' || d.kind === 'bad' ? 12 : 18;
        ctx.font = `${d.kind === 'big' || d.kind === 'slow' ? 28 : 26}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji, d.x, d.y);
        ctx.restore();
      }

      // kalkan (büyük power'da genişler)
      const sx = shieldRef.current.x;
      const wide = Date.now() < shieldWidthUntilRef.current;
      const arcR = wide ? 54 : 34;
      ctx.strokeStyle = wide ? '#67e8f9' : '#fde68a';
      ctx.lineWidth = wide ? 6 : 4;
      ctx.shadowColor = wide ? '#22d3ee' : '#fbbf24'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(sx, FLOOR - 26, arcR, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', sx, FLOOR - 26);

      // particle
      for (const p of partsRef.current) {
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 * (p.life / p.max), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (elapsed >= ROUND_MS) { endGame(scoreRef.current >= DEF.rewardThreshold && livesRef.current > 0); return; }
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

  // Kalkanı yatay konumlandır; bozuk yorumu engelle, power-up'ı topla.
  const moveShield = useCallback(
    (clientX: number, target: HTMLCanvasElement) => {
      const rect = target.getBoundingClientRect();
      const sx = W / rect.width;
      const x = (clientX - rect.left) * sx;
      shieldRef.current.x = Math.max(20, Math.min(W - 20, x));
      const shieldY = FLOOR - 26;
      const reach = Date.now() < shieldWidthUntilRef.current ? 64 : 44;
      const near = dropsRef.current.filter((d) => Math.hypot(d.x - shieldRef.current.x, d.y - shieldY) < reach);
      if (!near.length) return;
      dropsRef.current = dropsRef.current.filter((d) => !near.includes(d));
      for (const d of near) {
        if (d.kind === 'bad') {
          // bozuk yorumu engelle → puan + kalkan dalgası
          scoreRef.current += 1;
          setScore(scoreRef.current);
          sfxCollectStar(scoreRef.current % 6);
          haptic(8);
          burst(d.x, d.y, '#fbbf24', 14);
          wavesRef.current.push({ r: 10, life: 22 });
        } else if (d.kind === 'big') {
          shieldWidthUntilRef.current = Date.now() + 6000;
          sfxPowerUp();
          haptic([10, 20]);
          burst(d.x, d.y, '#22d3ee', 18);
        } else if (d.kind === 'slow') {
          slowUntilRef.current = Date.now() + 4000;
          sfxPowerUp();
          haptic([10, 20]);
          burst(d.x, d.y, '#a855f7', 18);
        } else {
          // iyi yorumu kalkanla itersen ödül kaçar (cezasız ama puan yok)
          dropsRef.current.push(d); // geri koy: iyi yorum geçsin
        }
      }
      if (scoreRef.current >= DEF.maxScore) endGame(true);
    },
    [burst, endGame]
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
            <Heart key={i} className="h-5 w-5" style={{ color: i < lives ? '#f43f5e' : '#3f3f46', fill: i < lives ? '#f43f5e' : 'transparent' }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}><ShieldCheck className="h-4 w-4" /> {score}</div>
          {combo >= 3 && (
            <span className="flex items-center gap-0.5 font-bold text-orange-400"><Flame className="h-3.5 w-3.5" />{combo}x</span>
          )}
        </div>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</div>
      </div>

      <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-amber-300/30" style={{ boxShadow: '0 0 40px -8px rgba(251,191,36,0.5)' }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerMove={(e) => moveShield(e.clientX, e.currentTarget)}
          onPointerDown={(e) => moveShield(e.clientX, e.currentTarget)}
          className="block h-auto w-full touch-none"
          style={{ background: 'radial-gradient(circle at 50% 0%, #1e3a5f 0%, #0a1628 60%, #050a14 100%)', cursor: 'pointer' }}
        />
      </div>
      <p className="mt-2 text-center text-[11px] text-white/50">🛡️ Kaydır · 😊 iyi yorumu geçir · 💢 bozuğu engelle · 🛡️ büyük kalkan · ⏳ yavaşlat</p>
    </GameShell>
  );
}
