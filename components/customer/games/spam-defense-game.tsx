'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Zap, ShieldHalf } from 'lucide-react';
import { GameShell } from './game-shell';
import { useMiniGame } from '@/lib/use-mini-game';
import { getMiniGame } from '@/lib/minigame-config';
import { getGameCopy } from '@/lib/minigame-copy';
import { sfxCollectStar, sfxHit, sfxWin, sfxBoom, sfxPowerUp, haptic } from '@/lib/game-sounds';

const DEF = getMiniGame('spam-defense')!;
const W = 360;
const H = 420;
const CX = W / 2;
const CY = H / 2;
const CORE_R = 34;
const MAX_LIVES = 3;
const ROUND_MS = 50_000;
const SHIELD_CHARGE_MS = 9000; // kalkan şarj süresi

type Enemy = { x: number; y: number; vx: number; vy: number; r: number; hp: number; maxHp: number; born: number; boss: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string };
type Wave = { r: number; life: number };

function reduced() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-animations');
}

export function SpamDefenseGame() {
  const game = useMiniGame('spam-defense');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = useState(Math.round(ROUND_MS / 1000));
  const [shieldPct, setShieldPct] = useState(0); // kalkan şarj %
  const [retry, setRetry] = useState(0); // canvas mount retry tetikleyici

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const enemiesRef = useRef<Enemy[]>([]);
  const partsRef = useRef<Particle[]>([]);
  const wavesRef = useRef<Wave[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const shakeRef = useRef(0);
  const lasersRef = useRef<Array<{ tx: number; ty: number; life: number }>>([]);
  const shieldReadyAtRef = useRef(0); // bu zamandan sonra kalkan hazır

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

  const spawnParts = useCallback((x: number, y: number, c: string, n: number) => {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      partsRef.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 24, max: 24, c });
    }
  }, []);

  const killEnemy = useCallback(
    (e: Enemy) => {
      enemiesRef.current = enemiesRef.current.filter((x) => x !== e);
      const gain = e.boss ? 3 : 1;
      scoreRef.current += gain;
      setScore(scoreRef.current);
      sfxCollectStar(scoreRef.current % 6);
      spawnParts(e.x, e.y, e.boss ? '#a855f7' : '#fbbf24', e.boss ? 28 : 16);
      if (e.boss) { sfxBoom(); haptic(30); }
      if (scoreRef.current >= DEF.maxScore) endGame(true);
    },
    [endGame, spawnParts]
  );

  // Çekirdek kalkanı: hazırsa 360° dalga tüm botlara hasar verir.
  const fireShield = useCallback(() => {
    if (!runningRef.current || Date.now() < shieldReadyAtRef.current) return;
    shieldReadyAtRef.current = Date.now() + SHIELD_CHARGE_MS;
    wavesRef.current.push({ r: CORE_R, life: 28 });
    sfxPowerUp();
    haptic([10, 20, 10]);
    // Dalga menzilindeki tüm botlara 1 hasar (boss'a da).
    for (const e of [...enemiesRef.current]) {
      e.hp -= 1;
      spawnParts(e.x, e.y, '#67e8f9', 6);
      if (e.hp <= 0) killEnemy(e);
    }
  }, [killEnemy, spawnParts]);

  // Tıklama / dokunma → çekirdeğe yakınsa kalkan, değilse en yakın botu vur.
  const shoot = useCallback(
    (cx: number, cy: number) => {
      if (!runningRef.current) return;
      // Çekirdek yakınına tıklama = kalkan dalgası.
      if (Math.hypot(cx - CX, cy - CY) < CORE_R + 18) {
        fireShield();
        return;
      }
      let hit: Enemy | null = null;
      for (const e of enemiesRef.current) {
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d < e.r + 14) {
          if (!hit || d < Math.hypot(hit.x - cx, hit.y - cy)) hit = e;
        }
      }
      if (hit) {
        const target = hit;
        lasersRef.current.push({ tx: target.x, ty: target.y, life: 6 });
        target.hp -= 1;
        spawnParts(target.x, target.y, DEF.accent, 8);
        haptic(6);
        if (target.hp <= 0) killEnemy(target);
        else sfxHit();
      }
    },
    [fireShield, killEnemy, spawnParts]
  );

  useEffect(() => {
    if (!playing) return;
    // Canvas DOM'a basılmadan effect çalışırsa (geçiş animasyonu vb.) bir sonraki
    // frame'de yeniden dene — oyun döngüsü kesinlikle başlasın.
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
    enemiesRef.current = [];
    partsRef.current = [];
    lasersRef.current = [];
    wavesRef.current = [];
    shieldReadyAtRef.current = Date.now() + SHIELD_CHARGE_MS;
    setScore(0);
    setLives(MAX_LIVES);
    setShieldPct(0);
    const startedAt = Date.now();
    let lastBoss = 0;
    setTimeLeft(Math.round(ROUND_MS / 1000));

    const spawnEnemy = (boss = false) => {
      if (!runningRef.current) return;
      const edge = Math.floor(Math.random() * 4);
      let x = 0;
      let y = 0;
      if (edge === 0) { x = Math.random() * W; y = -20; }
      else if (edge === 1) { x = W + 20; y = Math.random() * H; }
      else if (edge === 2) { x = Math.random() * W; y = H + 20; }
      else { x = -20; y = Math.random() * H; }
      const ang = Math.atan2(CY - y, CX - x);
      const elapsed = Date.now() - startedAt;
      const speed = (boss ? 0.45 : 0.6) + (elapsed / ROUND_MS) * 1.1; // zorluk artışı
      const tough = !boss && Math.random() < Math.min(0.4, elapsed / ROUND_MS);
      const hp = boss ? 5 : tough ? 2 : 1;
      enemiesRef.current.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: boss ? 26 : tough ? 18 : 13,
        hp,
        maxHp: hp,
        born: Date.now(),
        boss,
      });
    };

    let spawnAcc = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      spawnAcc += dt;
      const elapsed = Date.now() - startedAt;
      const spawnEvery = Math.max(380, 900 - (elapsed / ROUND_MS) * 600);
      if (spawnAcc > spawnEvery) { spawnAcc = 0; spawnEnemy(); }
      // 14 sn'de bir boss bot.
      if (elapsed - lastBoss > 14000 && elapsed > 8000) { lastBoss = elapsed; spawnEnemy(true); }

      // kalkan şarjı (HUD)
      const chargeLeft = shieldReadyAtRef.current - Date.now();
      setShieldPct(Math.max(0, Math.min(100, Math.round((1 - chargeLeft / SHIELD_CHARGE_MS) * 100))));

      // güncelle
      for (const e of enemiesRef.current) {
        e.x += e.vx * (dt / 16);
        e.y += e.vy * (dt / 16);
      }

      // kalkan dalgaları: genişle + menzile giren botlara hasar
      for (const wv of wavesRef.current) {
        wv.r += 9;
        wv.life -= 1;
        for (const e of [...enemiesRef.current]) {
          if (Math.abs(Math.hypot(e.x - CX, e.y - CY) - wv.r) < 16 && !(e as Enemy & { _w?: boolean })._w) {
            (e as Enemy & { _w?: boolean })._w = true;
            e.hp -= 1;
            if (e.hp <= 0) killEnemy(e);
          }
        }
      }
      wavesRef.current = wavesRef.current.filter((w) => w.life > 0 && w.r < W);

      // çekirdeğe varan botlar → can
      const reached = enemiesRef.current.filter((e) => Math.hypot(e.x - CX, e.y - CY) < CORE_R + e.r);
      if (reached.length) {
        enemiesRef.current = enemiesRef.current.filter((e) => !reached.includes(e));
        livesRef.current -= reached.length;
        setLives(Math.max(0, livesRef.current));
        shakeRef.current = 8;
        sfxHit();
        haptic([20, 30]);
        spawnParts(CX, CY, '#f43f5e', 20);
        if (livesRef.current <= 0) { endGame(false); }
      }

      for (const p of partsRef.current) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 1; }
      partsRef.current = partsRef.current.filter((p) => p.life > 0);

      // çiz
      const sh = shakeRef.current;
      shakeRef.current = Math.max(0, sh - 0.6);
      ctx.save();
      if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      ctx.clearRect(-10, -10, W + 20, H + 20);

      // ızgara arka plan
      ctx.strokeStyle = `${DEF.accent}14`;
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= W; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (let gy = 0; gy <= H; gy += 30) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

      // lazer ışınları (çekirdekten hedefe, hızla solar)
      for (const lz of lasersRef.current) {
        const a = lz.life / 6;
        ctx.strokeStyle = `rgba(255,240,180,${a})`;
        ctx.lineWidth = 2 + a * 2;
        ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(lz.tx, lz.ty); ctx.stroke();
        ctx.shadowBlur = 0;
        lz.life -= 1;
      }
      lasersRef.current = lasersRef.current.filter((l) => l.life > 0);

      // kalkan dalgaları
      for (const wv of wavesRef.current) {
        const a = wv.life / 28;
        ctx.strokeStyle = `rgba(103,232,249,${a * 0.8})`;
        ctx.lineWidth = 5 * a + 1;
        ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(CX, CY, wv.r, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // çekirdek
      const pulse = 1 + Math.sin(now * 0.005) * 0.08;
      // kalkan hazır halkası
      if (Date.now() >= shieldReadyAtRef.current) {
        ctx.strokeStyle = `rgba(103,232,249,${0.4 + Math.sin(now * 0.006) * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(CX, CY, CORE_R + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      const grd = ctx.createRadialGradient(CX, CY, 4, CX, CY, CORE_R * 1.8);
      grd.addColorStop(0, '#fff7ed');
      grd.addColorStop(0.4, '#fbbf24');
      grd.addColorStop(1, `${DEF.accent}00`);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(CX, CY, CORE_R * 1.8 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(CX, CY, CORE_R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '24px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💎', CX, CY);

      // botlar
      for (const e of enemiesRef.current) {
        (e as Enemy & { _w?: boolean })._w = false; // dalga hasar bayrağını sıfırla
        ctx.fillStyle = e.boss ? '#7c3aed' : e.hp > 1 ? '#dc2626' : '#f43f5e';
        ctx.shadowColor = e.boss ? '#a855f7' : '#f43f5e'; ctx.shadowBlur = e.boss ? 20 : 12;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `${e.r + 4}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(e.boss ? '👹' : '🤖', e.x, e.y);
        // HP barı (çok-canlılar/boss)
        if (e.maxHp > 1) {
          const bw = e.boss ? 40 : 26;
          ctx.fillStyle = '#0008'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw, 4);
          ctx.fillStyle = e.boss ? '#a855f7' : '#fbbf24'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 8, bw * (e.hp / e.maxHp), 4);
        }
      }

      // particle
      for (const p of partsRef.current) {
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 * (p.life / p.max), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

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

  const onPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = W / rect.width;
      const sy = H / rect.height;
      shoot((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
    },
    [shoot]
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
        <div className="flex items-center gap-1.5" style={{ color: DEF.accent }}><Zap className="h-4 w-4" /> {score}</div>
        <div className="rounded-full bg-white/10 px-3 py-0.5 text-xs tabular-nums text-white/80">{timeLeft}s</div>
      </div>

      {/* Kalkan şarj çubuğu */}
      <div className="mb-2 flex items-center gap-2">
        <ShieldHalf className="h-4 w-4 shrink-0" style={{ color: shieldPct >= 100 ? '#67e8f9' : '#475569' }} />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${shieldPct}%`, background: shieldPct >= 100 ? 'linear-gradient(90deg,#22d3ee,#67e8f9)' : '#3b82f6' }}
          />
        </div>
        <span className="w-16 shrink-0 text-right text-[10px] font-bold" style={{ color: shieldPct >= 100 ? '#67e8f9' : '#64748b' }}>
          {shieldPct >= 100 ? 'HAZIR!' : 'kalkan'}
        </span>
      </div>

      <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-red-500/30" style={{ boxShadow: '0 0 40px -8px rgba(239,68,68,0.5)' }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPoint}
          className="block h-auto w-full touch-none"
          style={{ background: 'radial-gradient(circle at 50% 50%, #2a0a0a 0%, #120505 70%)', cursor: 'crosshair' }}
        />
      </div>
      <p className="mt-2 text-center text-[11px] text-white/50">🤖 Botlara dokun · 💎 Çekirdeğe dokun = kalkan dalgası · 👹 boss = 3 puan</p>
    </GameShell>
  );
}
