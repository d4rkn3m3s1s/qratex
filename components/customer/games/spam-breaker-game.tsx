'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Zap } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxWin, sfxPowerUp, sfxFanfare, sfxBoom, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('spam-breaker')!;
const W = 340;
const H = 440;
const PADDLE_W = 74;
const PADDLE_H = 12;
const BALL_R = 7;
const BRICK_ROWS = 5;
const BRICK_COLS = 7;
const BRICK_W = (W - 24) / BRICK_COLS;
const BRICK_H = 20;
const BRICK_TOP = 50;
const MAX_LIVES = 3;

function reducedMotion() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-animations');
}

interface Brick {
  x: number;
  y: number;
  hp: number;
  color: string;
}

const ROW_COLORS = ['#ef4444', '#f97316', '#fbbf24', '#a855f7', '#22d3ee'];

export function SpamBreakerGame() {
  const game = useMiniGame('spam-breaker');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [retry, setRetry] = useState(0);
  const [launched, setLaunched] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paddleXRef = useRef(W / 2);
  const ballRef = useRef({ x: W / 2, y: H - 60, vx: 0, vy: 0 });
  const bricksRef = useRef<Brick[]>([]);
  const launchedRef = useRef(false);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const shakeRef = useRef(0);

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

  const buildBricks = useCallback(() => {
    const out: Brick[] = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        out.push({
          x: 12 + c * BRICK_W,
          y: BRICK_TOP + r * (BRICK_H + 6),
          hp: r < 2 ? 2 : 1, // üst sıralar daha sağlam
          color: ROW_COLORS[r % ROW_COLORS.length],
        });
      }
    }
    bricksRef.current = out;
  }, []);

  const resetBall = useCallback(() => {
    ballRef.current = { x: paddleXRef.current, y: H - 60, vx: 0, vy: 0 };
    launchedRef.current = false;
    setLaunched(false);
  }, []);

  const launch = useCallback(() => {
    if (launchedRef.current || !runningRef.current) return;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const speed = 5.2;
    ballRef.current.vx = Math.cos(angle) * speed;
    ballRef.current.vy = Math.sin(angle) * speed;
    launchedRef.current = true;
    setLaunched(true);
    sfxPowerUp();
    haptic(6);
  }, []);

  // pointer / touch ile paddle kontrolü
  useEffect(() => {
    if (!playing) return;
    const el = canvasRef.current;
    if (!el) return;
    const moveTo = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const scale = W / rect.width;
      const x = (clientX - rect.left) * scale;
      paddleXRef.current = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, x));
      if (!launchedRef.current) ballRef.current.x = paddleXRef.current;
    };
    const onMouse = (e: MouseEvent) => moveTo(e.clientX);
    const onTouch = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      moveTo(e.touches[0].clientX);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        paddleXRef.current = Math.max(PADDLE_W / 2, paddleXRef.current - 28);
        if (!launchedRef.current) ballRef.current.x = paddleXRef.current;
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        paddleXRef.current = Math.min(W - PADDLE_W / 2, paddleXRef.current + 28);
        if (!launchedRef.current) ballRef.current.x = paddleXRef.current;
      } else if (e.key === ' ') {
        e.preventDefault();
        launch();
      }
    };
    el.addEventListener('mousemove', onMouse);
    el.addEventListener('touchmove', onTouch, { passive: false });
    el.addEventListener('touchstart', onTouch, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('mousemove', onMouse);
      el.removeEventListener('touchmove', onTouch);
      el.removeEventListener('touchstart', onTouch);
      window.removeEventListener('keydown', onKey);
    };
  }, [playing, launch]);

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
    setScore(0);
    setLives(MAX_LIVES);
    paddleXRef.current = W / 2;
    buildBricks();
    resetBall();

    const hitBrick = (b: Brick, idx: number) => {
      b.hp -= 1;
      scoreRef.current += 1;
      setScore(scoreRef.current);
      shakeRef.current = 4;
      if (b.hp <= 0) {
        bricksRef.current.splice(idx, 1);
        sfxCollectStar(scoreRef.current % 6);
        haptic(6);
      } else {
        sfxHit();
      }
      // hız kademeli artar
      const sp = Math.min(8.5, 5.2 + scoreRef.current * 0.06);
      const v = ballRef.current;
      const mag = Math.hypot(v.vx, v.vy) || 1;
      v.vx = (v.vx / mag) * sp;
      v.vy = (v.vy / mag) * sp;

      if (scoreRef.current >= DEF.maxScore || bricksRef.current.length === 0) {
        sfxFanfare();
        endGame(scoreRef.current >= DEF.rewardThreshold);
      }
    };

    // Tek bir fizik alt-adımı (dt ölçekli). Tünelleme önlemek için kare başına
    // birden çok kez, her adım top yarıçapından küçük mesafe ile çağrılır.
    const stepPhysics = (dt: number): boolean => {
      const v = ballRef.current;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      // duvarlar
      if (v.x - BALL_R < 0) { v.x = BALL_R; v.vx = Math.abs(v.vx); }
      if (v.x + BALL_R > W) { v.x = W - BALL_R; v.vx = -Math.abs(v.vx); }
      if (v.y - BALL_R < 0) { v.y = BALL_R; v.vy = Math.abs(v.vy); }
      // alt → can kaybı
      if (v.y - BALL_R > H) {
        livesRef.current -= 1;
        setLives(livesRef.current);
        sfxBoom();
        haptic([20, 40]);
        shakeRef.current = 10;
        if (livesRef.current <= 0) {
          // Tüm toplar düştü = KAYIP (ödül yok). Tuğla temizleme kazanımı yukarıda ayrı.
          endGame(false);
          return false;
        }
        resetBall();
        return false;
      }
      // paddle çarpışma (sadece aşağı inerken)
      const py = H - 28;
      const half = PADDLE_W / 2;
      if (v.vy > 0 && v.y + BALL_R >= py && v.y - BALL_R <= py + PADDLE_H) {
        if (v.x >= paddleXRef.current - half - BALL_R && v.x <= paddleXRef.current + half + BALL_R) {
          const rel = Math.max(-1, Math.min(1, (v.x - paddleXRef.current) / half)); // -1..1
          const sp = Math.hypot(v.vx, v.vy);
          const ang = -Math.PI / 2 + rel * (Math.PI / 3);
          v.vx = Math.cos(ang) * sp;
          v.vy = Math.sin(ang) * sp;
          v.y = py - BALL_R;
          sfxPowerUp();
          haptic(4);
        }
      }
      // tuğla çarpışma
      for (let i = bricksRef.current.length - 1; i >= 0; i--) {
        const b = bricksRef.current[i];
        if (v.x + BALL_R > b.x && v.x - BALL_R < b.x + BRICK_W && v.y + BALL_R > b.y && v.y - BALL_R < b.y + BRICK_H) {
          const overlapX = Math.min(v.x + BALL_R - b.x, b.x + BRICK_W - (v.x - BALL_R));
          const overlapY = Math.min(v.y + BALL_R - b.y, b.y + BRICK_H - (v.y - BALL_R));
          if (overlapX < overlapY) v.vx *= -1;
          else v.vy *= -1;
          hitBrick(b, i);
          break;
        }
      }
      return runningRef.current;
    };

    const loop = () => {
      if (!runningRef.current) return;
      const v = ballRef.current;
      if (launchedRef.current) {
        // hıza göre alt-adım sayısı: her adımda kat edilen mesafe < BALL_R
        const speed = Math.hypot(v.vx, v.vy);
        const sub = Math.max(1, Math.ceil(speed / (BALL_R * 0.7)));
        const dt = 1 / sub;
        for (let s = 0; s < sub; s++) {
          if (!stepPhysics(dt)) break;
        }
        if (!runningRef.current) return;
      } else {
        v.x = paddleXRef.current;
      }

      // çizim
      ctx.save();
      let sx = 0, sy = 0;
      if (shakeRef.current > 0 && !reducedMotion()) {
        sx = (Math.random() - 0.5) * shakeRef.current;
        sy = (Math.random() - 0.5) * shakeRef.current;
        shakeRef.current *= 0.85;
        if (shakeRef.current < 0.4) shakeRef.current = 0;
      }
      ctx.translate(sx, sy);
      ctx.clearRect(-12, -12, W + 24, H + 24);
      ctx.fillStyle = '#140505';
      ctx.fillRect(-12, -12, W + 24, H + 24);

      // tuğlalar
      for (const b of bricksRef.current) {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = b.hp > 1 ? 12 : 6;
        ctx.globalAlpha = b.hp > 1 ? 1 : 0.85;
        ctx.fillRect(b.x + 1.5, b.y + 1.5, BRICK_W - 3, BRICK_H - 3);
        ctx.globalAlpha = 1;
        if (b.hp > 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(b.x + 1.5, b.y + 1.5, BRICK_W - 3, 4);
        }
        ctx.shadowBlur = 0;
      }

      // paddle
      const px = paddleXRef.current - PADDLE_W / 2;
      const ppy = H - 28;
      ctx.fillStyle = DEF.accent;
      ctx.shadowColor = DEF.accent;
      ctx.shadowBlur = 14;
      roundRect(ctx, px, ppy, PADDLE_W, PADDLE_H, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // top
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(v.x, v.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!launchedRef.current) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 13px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Dokun / Boşluk → fırlat', W / 2, H - 70);
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
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
      copy={getGameCopy(DEF.gameType)}
    >
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart key={i} className="h-4 w-4" style={{ color: i < lives ? '#f43f5e' : '#3f3f46', fill: i < lives ? '#f43f5e' : 'transparent' }} />
          ))}
        </div>
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
          <Zap className="h-4 w-4" /> {score}
        </div>
        <div className="text-xs text-white/60">Hedef: {DEF.rewardThreshold}</div>
      </div>

      <div
        className="relative mx-auto flex w-full flex-col items-center gap-3 overflow-hidden rounded-2xl p-3"
        style={{ background: 'radial-gradient(circle at 50% 20%, #2a0808 0%, #140505 55%, #080202 85%)' }}
        onClick={() => !launched && launch()}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="max-w-full touch-none rounded-xl"
          style={{ boxShadow: `0 0 30px ${DEF.accent}33` }}
        />
        <p className="text-center text-[10px] text-white/40">🖱️ Fareyle/dokunarak kalkanı oynat · top spam tuğlalarını kırsın · {DEF.rewardThreshold}+ = ödül</p>
      </div>
    </GameShell>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
