'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Snowflake, Flame } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import {
  sfxCollectStar,
  sfxHit,
  sfxWin,
  sfxCombo,
  sfxFanfare,
  haptic,
} from '@/lib/game-sounds';

/**
 * KAR TANESİ YAKALA (Frost Catcher) — Buzul Krallığı temalı yakalama oyunu.
 *
 * Mekanik: Yukarıdan kar taneleri ve nadir "altın kristal" düşer; oyuncu altta
 * bir eldivenle (fare/dokunmatik ile yatay hareket) yakalar. Yakalayınca +puan
 * ve kombo çarpanı; kar tanesini kaçırınca (yere düşerse) kombo sıfırlanır ve
 * bir can gider. 40 sn süre VEYA 3 can — hangisi önce biterse. Altın kristal
 * kaçırılırsa ceza yok (sadece bonus fırsatı).
 *
 * Ödül DAİMA sunucuda (generic complete route) hesaplanır — bu bileşen yalnızca
 * skoru ve won bilgisini `game.finish` ile bildirir, ASLA puan yazmaz.
 *
 * Canvas: sabit mantıksal W×H koordinat sistemi, DPR'ye göre ölçeklenir; pointer
 * konumu getBoundingClientRect ile mantıksal koordinata çevrilir. rAF döngüsü +
 * mount retry guard + cleanup ile React ref kurallarına uyar. reduce-animations
 * açıksa parçacık/parıltı efektleri sadeleştirilir.
 */
const DEF = getMiniGame('frost-catcher')!;
const W = 360; // mantıksal genişlik (CSS ile ölçeklenir)
const H = 460; // mantıksal yükseklik
const MAX_LIVES = 3;
const ROUND_MS = 40_000;
const FLOOR = H - 26; // kar tanelerinin "kaçtı" sayıldığı taban çizgisi
const GLOVE_Y = FLOOR - 22; // eldiven yakalama hattı
const GLOVE_HALF = 34; // eldiven yakalama yarı-genişliği (px)

type FlakeKind = 'snow' | 'gold';
type Flake = {
  x: number;
  y: number;
  vy: number;
  drift: number; // yatay salınım hızı
  phase: number; // salınım fazı
  spin: number; // dönme açısı
  spinV: number;
  r: number;
  kind: FlakeKind;
};
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string };

function reduced() {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('reduce-animations')
  );
}

/** Altı köşeli kar tanesi çizer (canvas path). */
function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.stroke();
    // küçük yan dallar
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(r * 0.28, -r * 0.82);
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(-r * 0.28, -r * 0.82);
    ctx.stroke();
  }
  ctx.restore();
}

export function FrostCatcherGame() {
  const game = useMiniGame('frost-catcher');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [retry, setRetry] = useState(0); // canvas mount retry tetikleyici

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flakesRef = useRef<Flake[]>([]);
  const partsRef = useRef<Particle[]>([]);
  const gloveXRef = useRef(W / 2);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const comboRef = useRef(0);
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
      // Skoru ve sonucu sunucuya bildir — ödül orada hesaplanır.
      void game.finish(scoreRef.current, won);
    },
    [game]
  );

  const burst = useCallback((x: number, y: number, c: string, n: number) => {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.6;
      partsRef.current.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 24,
        max: 24,
        c,
      });
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    let mountRaf = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      // Canvas henüz mount olmadıysa bir sonraki frame'de yeniden dene.
      mountRaf = requestAnimationFrame(() => setRetry((r) => r + 1));
      return () => cancelAnimationFrame(mountRaf);
    }

    // DPR'ye göre keskin çizim: backing store'u ölçekle, mantıksal koordinatta çiz.
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    comboRef.current = 0;
    flakesRef.current = [];
    partsRef.current = [];
    gloveXRef.current = W / 2;
    setScore(0);
    setLives(MAX_LIVES);
    setCombo(0);
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const simple = reduced();

    const spawn = () => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - startedAt;
      // Nadir altın kristal (%9) — büyük bonus.
      const gold = Math.random() < 0.09;
      flakesRef.current.push({
        x: 26 + Math.random() * (W - 52),
        y: -18,
        // Zamanla hızlanır (zorluk artışı).
        vy: 1.4 + Math.random() * 1.1 + (elapsed / ROUND_MS) * 1.8,
        drift: simple ? 0 : (Math.random() - 0.5) * 1.4,
        phase: Math.random() * Math.PI * 2,
        spin: 0,
        spinV: simple ? 0 : (Math.random() - 0.5) * 0.08,
        r: gold ? 13 : 12,
        kind: gold ? 'gold' : 'snow',
      });
    };

    let spawnAcc = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      spawnAcc += dt;
      const elapsed = Date.now() - startedAt;
      // Zamanla sıklaşan spawn.
      const every = Math.max(430, 820 - (elapsed / ROUND_MS) * 420);
      if (spawnAcc > every) {
        spawnAcc = 0;
        spawn();
      }

      const step = dt / 16;
      const gx = gloveXRef.current;

      // Kar tanelerini hareket ettir + yakalama/kaçırma tespiti.
      const survivors: Flake[] = [];
      for (const f of flakesRef.current) {
        f.y += f.vy * step;
        f.phase += 0.05 * step;
        f.spin += f.spinV * step;
        const x = f.x + (f.drift ? Math.sin(f.phase) * 10 : 0);

        // Eldivenle yakalama: eldiven hattına yaklaştıysa ve yatay mesafe uygunsa.
        if (f.y >= GLOVE_Y - 8 && f.y <= FLOOR + 6 && Math.abs(x - gx) <= GLOVE_HALF) {
          if (f.kind === 'gold') {
            // Altın kristal → 5 puan jackpot, komboyu da ilerletir.
            comboRef.current += 1;
            setCombo(comboRef.current);
            scoreRef.current += 5;
            setScore(scoreRef.current);
            sfxFanfare();
            haptic([10, 20, 10]);
            burst(x, GLOVE_Y, '#fbbf24', simple ? 8 : 26);
          } else {
            comboRef.current += 1;
            setCombo(comboRef.current);
            // Her 5 komboda +1 ekstra (kombo çarpanı).
            const bonus = comboRef.current % 5 === 0 ? 2 : 1;
            scoreRef.current += bonus;
            setScore(scoreRef.current);
            sfxCombo(comboRef.current);
            haptic(8);
            burst(x, GLOVE_Y, '#bae6fd', simple ? 6 : 16);
            if (comboRef.current > 0 && comboRef.current % 5 === 0) {
              sfxFanfare();
              burst(x, GLOVE_Y, '#38bdf8', simple ? 8 : 22);
            }
          }
          if (scoreRef.current >= DEF.maxScore) {
            endGame(true);
            return;
          }
          continue; // yakalandı → listeden düşer
        }

        // Tabana ulaştı (kaçırıldı)?
        if (f.y >= FLOOR) {
          if (f.kind === 'snow') {
            // Kar tanesi kaçtı → kombo sıfırlanır, bir can gider.
            comboRef.current = 0;
            setCombo(0);
            livesRef.current -= 1;
            setLives(Math.max(0, livesRef.current));
            sfxHit();
            haptic([18, 30]);
            burst(x, FLOOR, '#60a5fa', simple ? 6 : 14);
            if (livesRef.current <= 0) {
              endGame(false);
              return;
            }
          }
          // Altın kristal kaçarsa ceza yok (sadece kaçan bonus).
          continue;
        }

        survivors.push(f);
      }
      flakesRef.current = survivors;

      // Parçacıklar.
      for (const p of partsRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 1;
      }
      partsRef.current = partsRef.current.filter((p) => p.life > 0);

      // ---- ÇİZİM ----
      ctx.clearRect(0, 0, W, H);
      // Buzul gökyüzü.
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0b2545');
      bg.addColorStop(0.55, '#0a1b33');
      bg.addColorStop(1, '#050d1c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Zemin buz şeridi.
      ctx.fillStyle = 'rgba(56,189,248,0.10)';
      ctx.fillRect(0, FLOOR + 4, W, H - FLOOR);
      ctx.strokeStyle = `${DEF.accent}aa`;
      ctx.lineWidth = 2;
      if (!simple) {
        ctx.shadowColor = DEF.accent;
        ctx.shadowBlur = 12;
      }
      ctx.beginPath();
      ctx.moveTo(0, FLOOR + 4);
      ctx.lineTo(W, FLOOR + 4);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Kar taneleri.
      for (const f of flakesRef.current) {
        const x = f.x + (f.drift ? Math.sin(f.phase) * 10 : 0);
        if (f.kind === 'gold') {
          if (!simple) {
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 18;
          }
          // Altın kristal: parlayan elmas.
          ctx.fillStyle = '#fde68a';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.save();
          ctx.translate(x, f.y);
          ctx.rotate(f.spin);
          ctx.beginPath();
          ctx.moveTo(0, -f.r);
          ctx.lineTo(f.r * 0.8, 0);
          ctx.lineTo(0, f.r);
          ctx.lineTo(-f.r * 0.8, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          ctx.shadowBlur = 0;
        } else {
          if (!simple) {
            ctx.shadowColor = '#e0f2fe';
            ctx.shadowBlur = 10;
          }
          drawSnowflake(ctx, x, f.y, f.r, f.spin, '#e0f2fe');
          ctx.shadowBlur = 0;
        }
      }

      // Eldiven (yakalayıcı) — buz mavisi kavis + emoji.
      const gxDraw = gloveXRef.current;
      ctx.strokeStyle = DEF.accent;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      if (!simple) {
        ctx.shadowColor = DEF.accent;
        ctx.shadowBlur = 16;
      }
      ctx.beginPath();
      ctx.arc(gxDraw, GLOVE_Y + 6, GLOVE_HALF, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '24px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧤', gxDraw, GLOVE_Y - 2);

      // Parçacıklar.
      for (const p of partsRef.current) {
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4 * (p.life / p.max), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Süre bitti mi?
      if (elapsed >= ROUND_MS) {
        endGame(scoreRef.current >= DEF.rewardThreshold && livesRef.current > 0);
        return;
      }
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

  // Eldiveni yatay konumlandır (fare/dokunmatik sürükleme).
  const moveGlove = useCallback((clientX: number, target: HTMLCanvasElement) => {
    const rect = target.getBoundingClientRect();
    const scale = W / rect.width;
    const x = (clientX - rect.left) * scale;
    gloveXRef.current = Math.max(GLOVE_HALF - 6, Math.min(W - GLOVE_HALF + 6, x));
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
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart
              key={i}
              className="h-5 w-5"
              style={{
                color: i < lives ? '#f43f5e' : '#3f3f46',
                fill: i < lives ? '#f43f5e' : 'transparent',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}>
            <Snowflake className="h-4 w-4" /> {score}
          </div>
          {combo >= 3 && (
            <span className="flex items-center gap-0.5 font-bold text-sky-300">
              <Flame className="h-3.5 w-3.5" />
              {combo}x
            </span>
          )}
        </div>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">
          {timeLeft}s
        </div>
      </div>

      <div
        className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-sky-400/30"
        style={{ boxShadow: '0 0 40px -8px rgba(56,189,248,0.5)' }}
      >
        <canvas
          ref={canvasRef}
          onPointerMove={(e) => moveGlove(e.clientX, e.currentTarget)}
          onPointerDown={(e) => moveGlove(e.clientX, e.currentTarget)}
          className="block h-auto w-full touch-none"
          style={{
            aspectRatio: `${W} / ${H}`,
            background: 'radial-gradient(circle at 50% 0%, #0b2545 0%, #0a1628 60%, #050a14 100%)',
            cursor: 'pointer',
          }}
        />
      </div>
      <p className="mt-2 text-center text-[11px] text-white/50">
        🧤 Kaydır · ❄️ kar tanesini yakala · 💎 altın kristal = +5 · kaçırma, can gider!
      </p>
    </GameShell>
  );
}
