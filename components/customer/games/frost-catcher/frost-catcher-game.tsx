'use client';

/**
 * Kar Tanesi Yakala — v2 oynanış bileşeni (kabuk, mod, duraklatma, oturum ve ödül `GameHost`'ta).
 *
 * Mimari:
 *  - Mantık `sim.ts`'te (saf, tohumlu); sunucu aynı simülasyonu girdi kaydıyla yeniden oynatır.
 *  - 60 Hz sabit adımlı döngü, 2D canvas; React state'e ≤ 10 Hz HUD özeti.
 *  - Girdi adım başına en fazla bir kez uygulanır ve kaydedilir (`pending` → `update` başında),
 *    böylece kayıt sunucunun girdi hızı sınırının altında kalır ve replay birebir aynıdır.
 *  - Çarpışma her mantık adımında simülasyonda (eski Güven Muhafızı'nda yalnız işaretçi olayında).
 *  - Arka plan gradyanı yüzey başına bir kez kurulur; tanecik başına `shadowBlur` yok (eski B8).
 *  - Ses / titreşim / sarsıntı / parçacık yalnız `fx` üzerinden (hareket politikası + tercih).
 *  - Renk tek ayırt edici değil (Okabe–Ito): kar = beyaz altı kollu yıldız, altın = sarı elmas + ★,
 *    kara buz = turuncu sivri kristal + ✕ + kesikli kenar, kalkan = mavi halka + ⛨.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Heart, Shield, Snowflake } from 'lucide-react';
import type { GameComponentProps, GameFinish } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { useCanvasSurface, useCoarsePointer, useGameInput, useGameLoop, useLatestRef } from '@/lib/games/engine/hooks';
import { useFrostCopy } from './copy';
import { createInputRecorder } from '@/lib/games/engine/record';
import { sfxCollectStar, sfxCombo, sfxFanfare, sfxHit, sfxPowerUp, sfxWarn, sfxWin } from '@/lib/game-sounds';
import {
  ARENA_H,
  ARENA_W,
  DIR_CODE,
  GLOVE_H,
  GLOVE_W,
  GLOVE_Y,
  HZ,
  ITEM_R,
  MAX_LIVES,
  ROUND_STEPS,
  TARGET_CODE,
  createSim,
  itemDrawX,
  type FrostSim,
  type Item,
  type SimEvent,
} from './sim';

const TUTORIAL_KEY = 'qratex-frost-catcher-tutorial-v2';

const C = {
  flake: '#F5FAFF',
  flakeRim: '#56B4E9',
  gold: '#F0E442',
  goldRim: '#7a6f00',
  shard: '#E69F00',
  shardDark: '#3d1a05',
  shield: '#0072B2',
  shieldLight: '#9fd3f5',
  hurt: 'rgba(213,94,0,',
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
}
interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}
interface BgFlake {
  x: number;
  y: number;
  r: number;
  v: number;
}

interface Hud {
  score: number;
  lives: number;
  combo: number;
  timeLeft: number;
  phase: number;
  shield: boolean;
}

function readHud(sim: FrostSim): Hud {
  return {
    score: sim.score,
    lives: sim.lives,
    combo: sim.combo,
    timeLeft: Math.max(0, Math.ceil((ROUND_STEPS - sim.ticks) / HZ)),
    phase: sim.phase,
    shield: sim.shield,
  };
}

function hasSeenTutorial(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}
function markTutorialSeen() {
  try {
    window.localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* tercih kritik değil */
  }
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

function drawFlake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = C.flake;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(-r * 0.28, -r * 0.8);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 0.28, -r * 0.8);
    ctx.stroke();
  }
  ctx.fillStyle = C.flakeRim;
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGold(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pulse: number) {
  const s = r * (1.05 + pulse * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.8, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s * 0.8, y);
  ctx.closePath();
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.goldRim;
  ctx.stroke();
  ctx.fillStyle = '#1a1600';
  ctx.font = '900 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', x, y + 0.5);
}

function drawShard(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * 0.3);
  ctx.beginPath();
  const pts = 7;
  for (let k = 0; k < pts * 2; k++) {
    const rr = k % 2 === 0 ? r * 1.15 : r * 0.55;
    const a = (k / (pts * 2)) * Math.PI * 2;
    if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = C.shardDark;
  ctx.fill();
  ctx.setLineDash([3, 2]);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = C.shard;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-rot * 0.3);
  ctx.strokeStyle = C.shard;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -5);
  ctx.lineTo(5, 5);
  ctx.moveTo(5, -5);
  ctx.lineTo(-5, 5);
  ctx.stroke();
  ctx.restore();
}

function drawShieldItem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.shield;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.shieldLight;
  ctx.stroke();
  // Kalkan simgesi (çizim; yazı tipine bağımlı değil).
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x + 6, y - 4);
  ctx.quadraticCurveTo(x + 6, y + 4, x, y + 8);
  ctx.quadraticCurveTo(x - 6, y + 4, x - 6, y - 4);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

export function FrostCatcherGame({ seed, config, mode, paused, onPauseRequest, onFinish, fx, accent }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = useFrostCopy();
  const tRef = useLatestRef(t);
  const surface = useCanvasSurface(canvasRef, { width: ARENA_W, height: ARENA_H, alpha: false });
  const [sim] = useState(() => createSim(seed, { maxScore: config.maxScore }));
  const rec = useRef(createInputRecorder());
  const pendingTarget = useRef<number | null>(null);
  const pendingDir = useRef<number | null>(null);
  const lastTarget = useRef<number | null>(null);
  const heldDirs = useRef({ left: false, right: false });
  const particles = useRef<Particle[]>([]);
  const floats = useRef<FloatText[]>([]);
  const bgFlakes = useRef<BgFlake[]>([]);
  const bgCache = useRef<{ ctx: CanvasRenderingContext2D; grad: CanvasGradient } | null>(null);
  const shakeRef = useRef(0);
  const flashRef = useRef<{ color: string; life: number } | null>(null);
  const catchPulse = useRef(0);
  const finishedRef = useRef(false);
  const coarse = useCoarsePointer();

  const [intro, setIntro] = useState<boolean | null>(null);
  useEffect(() => {
    setIntro(!hasSeenTutorial());
  }, []);
  const [done, setDone] = useState(false);
  const running = intro === false && !done;
  const [hud, setHud] = useState<Hud>(() => readHud(sim));

  // Kozmetik arka plan karı (skoru etkilemez → Math.random serbest).
  useEffect(() => {
    if (bgFlakes.current.length) return;
    for (let i = 0; i < 36; i++) {
      bgFlakes.current.push({ x: Math.random() * ARENA_W, y: Math.random() * ARENA_H, r: 0.8 + Math.random() * 1.8, v: 0.2 + Math.random() * 0.5 });
    }
  }, []);

  const burst = useCallback(
    (x: number, y: number, color: string, n: number) => {
      if (!fx.canCelebrate()) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 150;
        particles.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0, max: 0.35 + Math.random() * 0.35, color, r: 1.4 + Math.random() * 2.2 });
      }
      if (particles.current.length > 220) particles.current.splice(0, particles.current.length - 220);
    },
    [fx]
  );

  const floatText = useCallback((x: number, y: number, text: string, color: string) => {
    floats.current.push({ x, y, text, color, life: 0 });
    if (floats.current.length > 10) floats.current.shift();
  }, []);

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      for (const ev of events) {
        switch (ev.type) {
          case 'catch': {
            const x = sim.gloveX;
            const gold = ev.item.kind === 'gold';
            burst(x, GLOVE_Y - 10, gold ? C.gold : C.flake, gold ? 22 : 10);
            floatText(x, GLOVE_Y - 24, `+${ev.gain}`, gold ? C.gold : '#e8f6ff');
            catchPulse.current = 1;
            fx.sfx(() => (gold ? sfxCollectStar() : sfxCombo(Math.min(1 + Math.floor(ev.combo / 3), 8))));
            fx.haptic('tap');
            if (ev.milestone) {
              floatText(ARENA_W / 2, ARENA_H / 2, tRef.current.combo(ev.combo), C.gold);
              fx.sfx(() => sfxFanfare());
              shakeRef.current = Math.max(shakeRef.current, fx.shake(3));
            }
            break;
          }
          case 'shard': {
            const x = sim.gloveX;
            if (ev.blocked) {
              burst(x, GLOVE_Y - 10, C.shieldLight, 18);
              floatText(x, GLOVE_Y - 28, 'Kalkan korudu!', C.shieldLight);
              fx.sfx(() => sfxPowerUp());
              fx.haptic([10, 30]);
            } else {
              burst(x, GLOVE_Y - 10, C.shard, 16);
              floatText(x, GLOVE_Y - 28, tRef.current.blackIce, '#ffb27a');
              fx.sfx(() => sfxHit());
              fx.haptic([20, 40, 20]);
              shakeRef.current = Math.max(shakeRef.current, fx.shake(6));
              flashRef.current = { color: C.hurt, life: 0 };
            }
            break;
          }
          case 'shield':
            burst(sim.gloveX, GLOVE_Y - 10, C.shieldLight, 14);
            floatText(sim.gloveX, GLOVE_Y - 28, tRef.current.shield, C.shieldLight);
            fx.sfx(() => sfxPowerUp());
            fx.haptic([10, 30]);
            break;
          case 'miss':
            if (ev.comboLost >= 5) {
              floatText(itemDrawX(ev.item, sim.ticks), ARENA_H - 16, tRef.current.comboLost, '#c7d2fe');
              fx.sfx(() => sfxWarn());
            }
            break;
          case 'phase':
            floatText(ARENA_W / 2, ARENA_H / 2 - 30, tRef.current.level(ev.phase + 1), '#ffffff');
            fx.sfx(() => sfxPowerUp());
            break;
          case 'end':
            break;
        }
      }
    },
    [sim, burst, floatText, fx]
  );

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDone(true);
    setHud(readHud(sim));
    const won = sim.score >= config.rewardThreshold;
    if (won) {
      fx.sfx(() => sfxWin());
      fx.haptic('success');
    }
    const proof: DeterministicProof = { log: rec.current.entries() as DeterministicProof['log'], steps: sim.ticks };
    const result: GameFinish = { score: sim.score, won, proof };
    window.setTimeout(() => onFinish(result), fx.canCelebrate() ? 550 : 0);
  }, [sim, config.rewardThreshold, fx, onFinish]);

  /** Bekleyen girdiyi adım başında uygula + kaydet (adım başına ≤ 1 hedef). */
  const flushInput = useCallback(() => {
    const step = sim.ticks;
    if (pendingDir.current !== null) {
      const d = pendingDir.current;
      pendingDir.current = null;
      if (!sim.setDir(d).illegal) {
        rec.current.record(step, DIR_CODE, d);
        lastTarget.current = null;
      }
    }
    if (pendingTarget.current !== null) {
      const t = pendingTarget.current;
      pendingTarget.current = null;
      if (t !== lastTarget.current && !sim.setTarget(t).illegal) {
        rec.current.record(step, TARGET_CODE, t);
        lastTarget.current = t;
      }
    }
  }, [sim]);

  useGameLoop({
    active: running,
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      if (sim.over) return;
      flushInput();
      const events = sim.tick();
      handleEvents(events);
      if (sim.over) finish();
    },
    render: () => draw(),
  });

  useEffect(() => {
    if (!running) return;
    let last = '';
    const id = window.setInterval(() => {
      const h = readHud(sim);
      const key = JSON.stringify(h);
      if (key !== last) {
        last = key;
        setHud(h);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, sim]);

  // Duraklatınca basılı yönleri bırak (devamda eldiven kendi kendine kaymasın).
  useEffect(() => {
    if (!paused) return;
    heldDirs.current = { left: false, right: false };
    pendingDir.current = 0;
  }, [paused]);

  const syncDir = () => {
    const { left, right } = heldDirs.current;
    pendingDir.current = left === right ? 0 : left ? -1 : 1;
    pendingTarget.current = null;
  };

  useGameInput(canvasRef, {
    active: running,
    swipe: false,
    repeatDelayMs: 1e9,
    toLogical: (x, y) => surface.current?.toLogical(x, y) ?? { x, y },
    onInput: (e) => {
      if (e.type === 'press') {
        if (e.action === 'pause') {
          onPauseRequest();
          return;
        }
        if (paused || e.repeat) return;
        if (e.action === 'left') heldDirs.current.left = true;
        else if (e.action === 'right') heldDirs.current.right = true;
        else return;
        syncDir();
        return;
      }
      if (e.type === 'release') {
        if (e.action === 'left') heldDirs.current.left = false;
        else if (e.action === 'right') heldDirs.current.right = false;
        else return;
        syncDir();
        return;
      }
      if (e.type === 'pointer' && (e.phase === 'down' || e.phase === 'move')) {
        if (paused) return;
        pendingTarget.current = Math.round(Math.min(ARENA_W, Math.max(0, e.x)));
      }
    },
  });

  function draw() {
    const s = surface.current;
    if (!s) return;
    const ctx = s.beginFrame();
    const dt = 1 / 60;
    const calm = !fx.canCelebrate();

    if (!bgCache.current || bgCache.current.ctx !== ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, ARENA_H);
      g.addColorStop(0, '#0b1a33');
      g.addColorStop(0.65, '#10294d');
      g.addColorStop(1, '#173a63');
      bgCache.current = { ctx, grad: g };
    }
    ctx.fillStyle = bgCache.current.grad;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    // Kozmetik kar (azaltılmış harekette durağan).
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const f of bgFlakes.current) {
      if (!calm && running && !paused) {
        f.y += f.v;
        if (f.y > ARENA_H) {
          f.y = -2;
          f.x = Math.random() * ARENA_W;
        }
      }
      ctx.fillRect(f.x, f.y, f.r, f.r);
    }

    ctx.save();
    if (shakeRef.current > 0.1) {
      ctx.translate((Math.random() - 0.5) * shakeRef.current * 2, (Math.random() - 0.5) * shakeRef.current * 2);
      shakeRef.current *= 0.86;
    } else shakeRef.current = 0;

    // Zemin kar şeridi.
    ctx.fillStyle = 'rgba(230,244,255,0.10)';
    ctx.fillRect(0, ARENA_H - 14, ARENA_W, 14);

    const t = sim.ticks;
    for (const it of sim.items) {
      const x = itemDrawX(it, t);
      const rot = calm ? 0 : (t - it.bornStep) / 40 + it.phaseOff;
      drawItem(ctx, it, x, rot, t);
    }

    // Eldiven.
    const gx = sim.gloveX;
    const pulse = catchPulse.current;
    catchPulse.current = Math.max(0, pulse - dt * 5);
    const gw = GLOVE_W * (1 + (calm ? 0 : pulse * 0.08));
    const gy = GLOVE_Y - GLOVE_H / 2;
    if (sim.shield) {
      ctx.beginPath();
      ctx.ellipse(gx, GLOVE_Y, gw / 2 + 10, GLOVE_H + 6, 0, Math.PI, 0);
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.shieldLight;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    roundRect(ctx, gx - gw / 2, gy, gw, GLOVE_H, 10);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e8f6ff';
    ctx.stroke();
    // Eldiven parmak çizgileri (biçim ipucu).
    ctx.strokeStyle = 'rgba(11,26,51,0.55)';
    ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) {
      const lx = gx - gw / 2 + (gw * k) / 4;
      ctx.beginPath();
      ctx.moveTo(lx, gy + 4);
      ctx.lineTo(lx, gy + GLOVE_H - 6);
      ctx.stroke();
    }

    // Parçacıklar.
    const ps = particles.current;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        ps.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + 160 * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px system-ui, sans-serif';
    const fs = floats.current;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i];
      f.life += dt;
      if (f.life > 0.9) {
        fs.splice(i, 1);
        continue;
      }
      const yy = f.y - (calm ? 0 : f.life * 36);
      ctx.globalAlpha = 1 - f.life / 0.9;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, yy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, yy);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    const fl = flashRef.current;
    if (fl) {
      fl.life += dt;
      if (fl.life > 0.35) flashRef.current = null;
      else {
        ctx.strokeStyle = `${fl.color}${(0.65 * (1 - fl.life / 0.35)).toFixed(2)})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
      }
    }
  }

  function drawItem(ctx: CanvasRenderingContext2D, it: Item, x: number, rot: number, t: number) {
    if (it.kind === 'flake') drawFlake(ctx, x, it.y, ITEM_R, rot);
    else if (it.kind === 'gold') drawGold(ctx, x, it.y, ITEM_R, fx.canCelebrate() ? (Math.sin(t / 6) + 1) / 2 : 0);
    else if (it.kind === 'shard') drawShard(ctx, x, it.y, ITEM_R, rot);
    else drawShieldItem(ctx, x, it.y, ITEM_R);
  }

  // Öğreticide / bitişte son kareyi çiz (döngü durmuşken boş tuval kalmasın).
  useEffect(() => {
    if (running) return;
    const id = requestAnimationFrame(() => draw());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, intro]);

  // Oyun başlayınca klavye odağı oyun alanında.
  useEffect(() => {
    if (running) canvasRef.current?.focus({ preventScroll: true });
  }, [running]);

  const startFromIntro = () => {
    markTutorialSeen();
    setIntro(false);
  };

  const hudSummary = useMemo(
    () => t.hudSummary(hud.score, hud.lives, hud.timeLeft, hud.phase + 1, hud.shield),
    [hud, t]
  );

  const pressVirtual = (dir: 'left' | 'right', down: boolean) => {
    if (!running || paused) return;
    heldDirs.current[dir] = down;
    syncDir();
  };

  return (
    <div className="mx-auto w-full max-w-[420px] select-none">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-white">
        <div className="flex items-center gap-0.5" aria-label={t.lives(hud.lives, MAX_LIVES)}>
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart
              key={i}
              aria-hidden
              className="h-5 w-5"
              style={{ color: i < hud.lives ? '#ff8a8a' : '#52525b', fill: i < hud.lives ? '#ff8a8a' : 'transparent' }}
            />
          ))}
          {hud.shield && <Shield aria-label={t.shieldOn} className="ml-1 h-5 w-5 text-[#9fd3f5]" />}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 tabular-nums" style={{ color: accent }}>
            <Snowflake className="h-4 w-4" aria-hidden /> {hud.score}
            <span className="text-xs font-medium text-white/65">/ {config.rewardThreshold}</span>
          </span>
          {hud.combo >= 3 && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-[#F0E442]">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {hud.combo}×
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">{t.levelShort(hud.phase + 1)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs tabular-nums text-white/90">{t.seconds(hud.timeLeft)}</span>
        </div>
      </div>
      <div className="mb-2 flex h-5 items-center justify-center gap-2 text-[11px] font-bold">
        {hud.combo >= 10 && (
          <span className="rounded-full bg-[#F0E442]/20 px-2 py-0.5 text-[#fff9c4]">
            {t.comboBonus(hud.combo >= 20 ? 2 : 1)}
          </span>
        )}
        {mode === 'practice' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/75">{t.practiceBadge}</span>}
      </div>
      <p className="sr-only" aria-live="polite">
        {hudSummary}
      </p>

      <div className="relative w-full overflow-hidden rounded-2xl bg-[#0b1a33]" style={{ aspectRatio: `${ARENA_W} / ${ARENA_H}`, maxHeight: '68vh' }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
          role="application"
          aria-roledescription={t.roleArena}
          aria-label={t.arenaLabel}
          tabIndex={0}
        />

        {intro && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fc-intro-title"
            className="absolute inset-0 z-10 flex flex-col justify-center gap-3 overflow-y-auto bg-black/80 p-5 text-white backdrop-blur-sm"
          >
            <h3 id="fc-intro-title" className="text-lg font-bold">
              {t.howTo}
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F5FAFF] text-sm font-black text-[#0b1a33]">❄</span>
                <span><strong>{t.flakeTitle}</strong>{t.flakeBody}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0E442] text-xs font-black text-black">★</span>
                <span><strong>{t.goldTitle}</strong>{t.goldBody}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E69F00] text-xs font-black text-black">✕</span>
                <span><strong>{t.iceTitle}</strong>{t.iceBody}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0072B2] text-xs font-black text-white">⛨</span>
                <span><strong>{t.shieldTitle}</strong>{t.shieldBody}</span>
              </li>
              <li className="text-white/80">
                {t.rounds}{' '}
                {mode === 'ranked' ? t.rankedRule(config.rewardThreshold) : t.practiceRule}
              </li>
              <li className="text-xs text-white/65">
                {coarse ? t.touchHelp : t.mouseHelp} {t.escPauses}
              </li>
            </ul>
            <button
              type="button"
              autoFocus
              onClick={startFromIntro}
              className="mt-1 h-11 rounded-xl font-bold text-[#0b1a33] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ background: accent }}
            >
              {t.gotIt}
            </button>
          </div>
        )}
      </div>

      {coarse && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(['left', 'right'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-label={d === 'left' ? t.left : t.right}
              disabled={!running}
              onPointerDown={(e) => {
                e.preventDefault();
                pressVirtual(d, true);
              }}
              onPointerUp={() => pressVirtual(d, false)}
              onPointerCancel={() => pressVirtual(d, false)}
              onPointerLeave={() => pressVirtual(d, false)}
              className="h-14 touch-none rounded-2xl bg-white/10 text-2xl font-bold text-white active:bg-white/20 disabled:opacity-40"
            >
              {d === 'left' ? '←' : '→'}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-[11px] text-white/65">{t.legend}</p>
    </div>
  );
}
