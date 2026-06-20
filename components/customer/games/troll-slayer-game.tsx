'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Swords, Zap, Flame } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { sfxCollectStar, sfxEatGhost, sfxHit, sfxWin, sfxCombo, sfxBoom, sfxFanfare, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('troll-slayer')!;
const W = 360;
const H = 420;
const ROUND_MS = 55_000;

type Troll = { x: number; y: number; vx: number; vy: number; r: number; hp: number; max: number; kind: number; wob: number; boss?: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string };

function reduced() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-animations');
}

const TROLL_EMOJI = ['👹', '👺', '🧌', '😈'];
const TROLL_COLOR = ['#f43f5e', '#fb7185', '#a855f7', '#f97316'];

export function TrollSlayerGame() {
  const game = useMiniGame('troll-slayer');
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [combo, setCombo] = useState(0);
  const [ultiPct, setUltiPct] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [retry, setRetry] = useState(0); // canvas mount retry tetikleyici

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trollsRef = useRef<Troll[]>([]);
  const partsRef = useRef<Particle[]>([]);
  const scoreRef = useRef(0);
  const waveRef = useRef(1);
  const comboRef = useRef(0);
  const ultiRef = useRef(0); // 0..100 öfke şarjı
  const flashRef = useRef(0); // ekran flash ömrü
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

  const burst = useCallback((x: number, y: number, c: string, n: number) => {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      partsRef.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 26, max: 26, c });
    }
  }, []);

  const addUlti = useCallback((amt: number) => {
    ultiRef.current = Math.min(100, ultiRef.current + amt);
    setUltiPct(ultiRef.current);
  }, []);

  // Öfke ulti'si: tüm trolleri yok eder, ekranı temizler.
  const unleashUlti = useCallback(() => {
    if (!runningRef.current || ultiRef.current < 100) return;
    ultiRef.current = 0;
    setUltiPct(0);
    flashRef.current = 12;
    shakeRef.current = 10;
    sfxFanfare();
    sfxBoom();
    haptic([20, 40, 20, 40]);
    let killed = 0;
    for (const t of [...trollsRef.current]) {
      burst(t.x, t.y, '#fbbf24', 18);
      scoreRef.current += t.boss ? 3 : 1;
      killed += 1;
    }
    trollsRef.current = [];
    setScore(scoreRef.current);
    if (killed > 0 && scoreRef.current >= DEF.maxScore) endGame(true);
  }, [burst, endGame]);

  // Kritik vuruş kıvılcımları (canvas particle).
  const critSpark = useCallback((x: number, y: number) => {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      partsRef.current.push({ x, y, vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5 - 1, life: 32, max: 32, c: '#fde68a' });
    }
  }, []);

  const slash = useCallback(
    (cx: number, cy: number) => {
      if (!runningRef.current) return;
      let hit: Troll | null = null;
      for (const t of trollsRef.current) {
        const d = Math.hypot(t.x - cx, t.y - cy);
        if (d < t.r + 12 && (!hit || d < Math.hypot(hit.x - cx, hit.y - cy))) hit = t;
      }
      if (!hit) {
        // Boşa vuruş → komboyu kır.
        comboRef.current = 0;
        setCombo(0);
        return;
      }
      const target = hit;
      // Kritik vuruş: %18 şans, 2 hasar + büyük efekt.
      const crit = Math.random() < 0.18;
      target.hp -= crit ? 2 : 1;
      shakeRef.current = target.boss ? 7 : crit ? 6 : 4;
      burst(target.x, target.y, crit ? '#fbbf24' : target.boss ? '#a855f7' : TROLL_COLOR[target.kind], crit ? 18 : target.boss ? 14 : 8);
      if (crit) {
        critSpark(target.x, target.y);
        haptic(15);
      }
      if (target.hp <= 0) {
        trollsRef.current = trollsRef.current.filter((t) => t !== target);
        comboRef.current += 1;
        setCombo(comboRef.current);
        addUlti(target.boss ? 25 : 10);
        // Boss 3 puan, normal 1 + her 5 komboda +1.
        const comboBonus = comboRef.current % 5 === 0 ? 1 : 0;
        scoreRef.current += (target.boss ? 3 : 1) + comboBonus;
        setScore(scoreRef.current);
        sfxEatGhost();
        sfxCombo(comboRef.current);
        burst(target.x, target.y, '#fbbf24', target.boss ? 34 : 18);
        if (comboRef.current > 0 && comboRef.current % 5 === 0) sfxFanfare();
        if (target.boss) { sfxWin(); haptic(30); }
        if (scoreRef.current >= DEF.maxScore) endGame(true);
      } else {
        sfxHit();
        haptic(5);
      }
    },
    [burst, endGame, addUlti, critSpark]
  );

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
    waveRef.current = 1;
    comboRef.current = 0;
    ultiRef.current = 0;
    flashRef.current = 0;
    trollsRef.current = [];
    partsRef.current = [];
    setScore(0);
    setWave(1);
    setCombo(0);
    setUltiPct(0);
    const startedAt = Date.now();
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const spawn = () => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - startedAt;
      const w = 1 + Math.floor(elapsed / 12000);
      if (w !== waveRef.current) {
        waveRef.current = w;
        setWave(w);
        sfxCollectStar(0);
        // 2. dalgadan itibaren her dalga başında bir BOSS troll çıkar (dev, çok HP).
        if (w >= 2) {
          const bx = Math.random() < 0.5 ? -30 : W + 30;
          trollsRef.current.push({
            x: bx, y: Math.random() * H,
            vx: 0, vy: 0,
            r: 34,
            hp: 4 + w,
            max: 4 + w,
            kind: 0,
            wob: Math.random() * Math.PI * 2,
            boss: true,
          });
          sfxHit();
        }
      }
      const edge = Math.random();
      const x = edge < 0.5 ? Math.random() * W : Math.random() < 0.5 ? -20 : W + 20;
      const y = edge >= 0.5 ? Math.random() * H : Math.random() < 0.5 ? -20 : H + 20;
      const kind = Math.floor(Math.random() * TROLL_EMOJI.length);
      const tough = Math.random() < Math.min(0.45, elapsed / ROUND_MS);
      trollsRef.current.push({
        x, y,
        vx: 0, vy: 0,
        r: tough ? 20 : 15,
        hp: tough ? 2 : 1,
        max: tough ? 2 : 1,
        kind,
        wob: Math.random() * Math.PI * 2,
      });
    };

    let spawnAcc = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      spawnAcc += dt;
      const elapsed = Date.now() - startedAt;
      const every = Math.max(420, 1100 - (elapsed / ROUND_MS) * 700);
      if (spawnAcc > every && trollsRef.current.length < 12) { spawnAcc = 0; spawn(); }

      // troller merkeze doğru salınarak yürür (arenadan çıkmaz)
      for (const t of trollsRef.current) {
        t.wob += 0.06;
        const ang = Math.atan2(H / 2 - t.y, W / 2 - t.x);
        const sp = 0.35 + (elapsed / ROUND_MS) * 0.5;
        t.x += Math.cos(ang) * sp + Math.cos(t.wob) * 0.6;
        t.y += Math.sin(ang) * sp + Math.sin(t.wob) * 0.6;
      }

      for (const p of partsRef.current) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 1; }
      partsRef.current = partsRef.current.filter((p) => p.life > 0);

      const sh = shakeRef.current;
      shakeRef.current = Math.max(0, sh - 0.5);
      ctx.save();
      if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      ctx.clearRect(-10, -10, W + 20, H + 20);

      // arena zemini (radyal)
      const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, '#2a0814');
      g.addColorStop(1, '#0a0206');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // arena halkası
      ctx.strokeStyle = `${DEF.accent}44`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.46, 0, Math.PI * 2); ctx.stroke();

      // troller
      for (const t of trollsRef.current) {
        ctx.save();
        if (t.boss) {
          // boss aura: nabız atan mor halka
          const aura = 1 + Math.sin(now * 0.006) * 0.12;
          ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 3;
          ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 24;
          ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 1.3 * aura, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.shadowColor = t.boss ? '#a855f7' : TROLL_COLOR[t.kind]; ctx.shadowBlur = t.boss ? 26 : 16;
        ctx.font = `${t.r + 8}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t.boss ? '👹' : TROLL_EMOJI[t.kind], t.x, t.y);
        ctx.restore();
        if (t.max > 1) {
          const bw = t.boss ? 46 : 28;
          ctx.fillStyle = '#0008'; ctx.fillRect(t.x - bw / 2, t.y - t.r - 8, bw, 4);
          ctx.fillStyle = t.boss ? '#a855f7' : '#fbbf24'; ctx.fillRect(t.x - bw / 2, t.y - t.r - 8, bw * (t.hp / t.max), 4);
        }
      }

      for (const p of partsRef.current) {
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 * (p.life / p.max), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ulti flash (ekran parlaması)
      if (flashRef.current > 0) {
        ctx.fillStyle = `rgba(255,240,180,${(flashRef.current / 12) * 0.6})`;
        ctx.fillRect(0, 0, W, H);
        flashRef.current -= 1;
      }
      ctx.restore();

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

  const onPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      slash((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height));
    },
    [slash]
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
    >
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs text-white/80">Dalga {wave}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}><Swords className="h-4 w-4" /> {score}</div>
          {combo >= 3 && (
            <span className="flex items-center gap-0.5 font-bold text-orange-400"><Flame className="h-3.5 w-3.5" />{combo}x</span>
          )}
        </div>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</div>
      </div>

      {/* Öfke (ulti) çubuğu — dolunca dokun, ekranı temizle */}
      <button
        onClick={unleashUlti}
        disabled={ultiPct < 100}
        className="mb-2 flex w-full items-center gap-2 rounded-full px-2 py-1 transition disabled:cursor-default"
        style={{ background: ultiPct >= 100 ? 'rgba(251,191,36,0.18)' : 'transparent' }}
      >
        <Flame className="h-4 w-4 shrink-0" style={{ color: ultiPct >= 100 ? '#fbbf24' : '#52525b' }} />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${ultiPct}%`, background: ultiPct >= 100 ? 'linear-gradient(90deg,#f97316,#fbbf24)' : '#a855f7' }} />
        </div>
        <span className="w-20 shrink-0 text-right text-[10px] font-bold" style={{ color: ultiPct >= 100 ? '#fbbf24' : '#64748b' }}>
          {ultiPct >= 100 ? '🔥 ÖFKE HAZIR!' : 'öfke'}
        </span>
      </button>

      <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-rose-500/30" style={{ boxShadow: '0 0 40px -8px rgba(244,63,94,0.5)' }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPoint}
          className="block h-auto w-full touch-none"
          style={{ cursor: 'crosshair' }}
        />
      </div>
      <p className="mt-2 text-center text-[11px] text-white/50">⚔️ Trollere dokun · ⭐ kritik vuruş ×2 · 🔥 öfke dolunca tüm ekranı temizle</p>
    </GameShell>
  );
}
