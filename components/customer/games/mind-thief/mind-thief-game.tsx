'use client';

/**
 * Zihin Hırsızı — v2 oynanış bileşeni (kabuk, mod, duraklatma, oturum ve ödül `GameHost`'ta).
 *
 * Mimari:
 *  - Mantık `sim.ts`'te (saf, tohumlu); sunucu aynı simülasyonu girdi kaydıyla yeniden oynatır.
 *  - 60 Hz sabit adımlı döngü (`useGameLoop`), 2D canvas çizimi; React state'e ≤ 10 Hz HUD özeti.
 *  - Hiçbir yan etki state updater içinde değil (eski bileşende `setComments(prev => …)` içinde
 *    `loseLife()` çağrılıyordu → StrictMode'da çift can kaybı). Olaylar `tick()` dönüşünden işlenir.
 *  - Patron (`Boss3D`) dekoratif arka plan; öfke geçişinde WebGL yeniden kurulmaz.
 *  - Ses / titreşim / sarsıntı yalnız `fx` üzerinden (hareket politikası + oyuncu tercihi).
 *  - Renk tek ayırt edici değil: bozuk = turuncu + ✕ + çapraz desen, gerçek = mavi + ✓ + düz,
 *    güç = sarı + kendi simgesi (Okabe–Ito renk körü güvenli palet).
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Heart, Snowflake, Star, Zap } from 'lucide-react';
import type { GameComponentProps, GameFinish } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { useCanvasSurface, useGameInput, useGameLoop, useLatestRef } from '@/lib/games/engine/hooks';
import { useGamesCopy } from '../copy';
import { useMindThiefCopy } from './copy';
import { createInputRecorder } from '@/lib/games/engine/record';
import { sfxCombo, sfxFanfare, sfxHit, sfxPowerUp, sfxWarn, sfxWin } from '@/lib/game-sounds';
import {
  ARENA_H,
  ARENA_W,
  CARD_H,
  CARD_W,
  HIT_CODE,
  HZ,
  MAX_LIVES,
  MIN_REACT_STEPS,
  ROUND_STEPS,
  createSim,
  type Entity,
  type EntityKind,
  type MindThiefSim,
  type SimEvent,
} from './sim';
import { CORRUPTED_TEXTS, GENUINE_TEXTS, POWER_LABEL } from './texts';

// three.js ayrı parça: oyun hemen açılır, patron arkadan yüklenir.
const Boss3D = dynamic(() => import('./boss-3d').then((m) => m.Boss3D), { ssr: false });

const TUTORIAL_KEY = 'qratex-mind-thief-tutorial-v2';

/** Okabe–Ito tabanlı, renk körü güvenli palet + ikon/desen ikinci kanal. */
const KIND_STYLE: Record<EntityKind, { fill: string; stroke: string; text: string; icon: string }> = {
  corrupted: { fill: '#3d1a05', stroke: '#E69F00', text: '#ffe2b8', icon: '✕' },
  genuine: { fill: '#06263f', stroke: '#56B4E9', text: '#d6eeff', icon: '✓' },
  freeze: { fill: '#2f2c06', stroke: '#F0E442', text: '#fff9c4', icon: '❄' },
  double: { fill: '#2f2c06', stroke: '#F0E442', text: '#fff9c4', icon: '×2' },
  heart: { fill: '#2f2c06', stroke: '#F0E442', text: '#fff9c4', icon: '♥' },
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

interface Hud {
  score: number;
  lives: number;
  combo: number;
  timeLeft: number;
  phase: number;
  rage: boolean;
  frozen: number;
  double: number;
}

function readHud(sim: MindThiefSim): Hud {
  return {
    score: sim.score,
    lives: sim.lives,
    combo: sim.combo,
    timeLeft: Math.max(0, Math.ceil((ROUND_STEPS - sim.ticks) / HZ)),
    phase: sim.phase,
    rage: sim.rage,
    frozen: Math.ceil(sim.frozenLeft / HZ),
    double: Math.ceil(sim.doubleLeft / HZ),
  };
}

function entityLabel(e: Entity): string {
  if (e.kind === 'corrupted') return CORRUPTED_TEXTS[e.text] ?? '';
  if (e.kind === 'genuine') return GENUINE_TEXTS[e.text] ?? '';
  return POWER_LABEL[e.kind as 'freeze' | 'double' | 'heart'];
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === 2) break;
    } else line = test;
  }
  if (lines.length < 2 && line) lines.push(line);
  if (lines.length === 2 && words.join(' ') !== lines.join(' ')) {
    let l = lines[1];
    while (l.length > 1 && ctx.measureText(`${l}…`).width > maxW) l = l.slice(0, -1);
    if (!words.join(' ').endsWith(l)) lines[1] = `${l}…`;
  }
  return lines;
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

export function MindThiefGame({ seed, config, mode, paused, onPauseRequest, onFinish, fx, accent }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = useMindThiefCopy();
  const c = useGamesCopy().common;
  const tRef = useLatestRef(t);
  const surface = useCanvasSurface(canvasRef, { width: ARENA_W, height: ARENA_H, alpha: true });
  const [sim] = useState(() => createSim(seed, { maxScore: config.maxScore }));
  const rec = useRef(createInputRecorder());
  const particles = useRef<Particle[]>([]);
  const floats = useRef<FloatText[]>([]);
  const shakeRef = useRef(0);
  const flashRef = useRef<{ color: string; life: number } | null>(null);
  const focusIdRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  // İlk oynayışta öğretici; null = henüz okunmadı (SSR/hidrasyon güvenli).
  const [intro, setIntro] = useState<boolean | null>(null);
  useEffect(() => {
    setIntro(!hasSeenTutorial());
  }, []);
  const [done, setDone] = useState(false);
  const running = intro === false && !done;

  const [hud, setHud] = useState<Hud>(() => readHud(sim));
  const [rage, setRage] = useState(false);
  const [hurt, setHurt] = useState(0);

  const burst = useCallback(
    (x: number, y: number, color: string, n: number) => {
      if (!fx.canCelebrate()) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 160;
        particles.current.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          max: 0.35 + Math.random() * 0.35,
          color,
          r: 1.5 + Math.random() * 2.5,
        });
      }
      if (particles.current.length > 260) particles.current.splice(0, particles.current.length - 260);
    },
    [fx]
  );

  const floatText = useCallback((x: number, y: number, text: string, color: string) => {
    floats.current.push({ x, y, text, color, life: 0 });
    if (floats.current.length > 12) floats.current.shift();
  }, []);

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      for (const ev of events) {
        switch (ev.type) {
          case 'hit': {
            const { x, y } = ev.entity;
            burst(x, y, KIND_STYLE.corrupted.stroke, ev.comboBonus ? 26 : 16);
            floatText(x, y - 8, `+${ev.gain}`, '#ffe2b8');
            fx.sfx(() => sfxCombo(Math.min(ev.combo, 8)));
            fx.haptic('tap');
            if (ev.comboBonus) {
              floatText(x, y - 32, `${ev.combo}× KOMBO`, '#F0E442');
              fx.sfx(() => sfxFanfare());
              shakeRef.current = Math.max(shakeRef.current, fx.shake(3));
            }
            break;
          }
          case 'wrong':
          case 'leak': {
            const { x, y } = ev.entity;
            burst(x, y, ev.type === 'wrong' ? KIND_STYLE.genuine.stroke : '#ff6b6b', 14);
            floatText(x, y, ev.type === 'wrong' ? tRef.current.wrong : tRef.current.leak, '#ff8a8a');
            fx.sfx(() => sfxHit());
            fx.haptic([20, 40, 20]);
            shakeRef.current = Math.max(shakeRef.current, fx.shake(6));
            flashRef.current = { color: 'rgba(255,80,80,', life: 0 };
            setHurt((h) => h + 1);
            if (focusIdRef.current === ev.entity.id) focusIdRef.current = null;
            break;
          }
          case 'power': {
            const { x, y, kind } = ev.entity;
            burst(x, y, KIND_STYLE[kind].stroke, 20);
            floatText(x, y, POWER_LABEL[kind as 'freeze' | 'double' | 'heart'], '#fff9c4');
            fx.sfx(() => sfxPowerUp());
            fx.haptic([10, 30]);
            break;
          }
          case 'rage':
            setRage(ev.on);
            if (ev.on) {
              fx.sfx(() => sfxWarn());
              shakeRef.current = Math.max(shakeRef.current, fx.shake(4));
              floatText(ARENA_W / 2, ARENA_H / 2, tRef.current.rage, '#ff8a8a');
            }
            break;
          case 'phase':
            floatText(ARENA_W / 2, ARENA_H / 2 - 30, `Seviye ${ev.phase + 1}`, '#ffffff');
            fx.sfx(() => sfxPowerUp());
            break;
          case 'end':
            break;
          case 'spawn':
            break;
        }
      }
    },
    [burst, floatText, fx]
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
    // Son efektin görünmesi için kısa nefes; kabuk sonucu bundan sonra gösterir.
    window.setTimeout(() => onFinish(result), fx.canCelebrate() ? 550 : 0);
  }, [sim, config.rewardThreshold, fx, onFinish]);

  const doHit = useCallback(
    (e: Entity) => {
      if (!running || paused || sim.over) return;
      const step = sim.ticks;
      const r = sim.hit(e.id);
      if (r.illegal) return; // ör. henüz belirmekte olan kart: dokunuş sayılmaz, kayda da girmez
      rec.current.record(step, HIT_CODE, e.id);
      if (focusIdRef.current === e.id) focusIdRef.current = null;
      handleEvents(r.events);
      if (sim.over) finish();
    },
    [running, paused, sim, handleEvents, finish]
  );

  useGameLoop({
    active: running,
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      if (sim.over) return;
      const events = sim.tick();
      handleEvents(events);
      if (focusIdRef.current !== null && !sim.entities.some((e) => e.id === focusIdRef.current)) {
        focusIdRef.current = null;
      }
      if (sim.over) finish();
    },
    render: () => draw(),
  });

  // HUD özeti ≤ 10 Hz (her karede React render'ı yok).
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

  const cycleFocus = useCallback(
    (dir: 1 | -1) => {
      const list = [...sim.entities].sort((a, b) => a.y - b.y || a.x - b.x);
      if (!list.length) {
        focusIdRef.current = null;
        return;
      }
      const i = list.findIndex((e) => e.id === focusIdRef.current);
      const next = i < 0 ? (dir === 1 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
      focusIdRef.current = list[next].id;
    },
    [sim]
  );

  useGameInput(canvasRef, {
    active: running,
    swipe: false,
    toLogical: (x, y) => surface.current?.toLogical(x, y) ?? { x, y },
    onInput: (e) => {
      if (e.type === 'press') {
        if (e.action === 'pause') {
          onPauseRequest();
          return;
        }
        if (paused || e.repeat) return;
        if (e.action === 'left' || e.action === 'up') cycleFocus(-1);
        else if (e.action === 'right' || e.action === 'down') cycleFocus(1);
        else if (e.action === 'primary') {
          const target = sim.entities.find((x) => x.id === focusIdRef.current);
          if (target) doHit(target);
          else cycleFocus(1);
        }
        return;
      }
      if (e.type === 'pointer' && e.phase === 'down') {
        if (paused) return;
        const target = sim.pick(e.x, e.y);
        if (target) doHit(target);
      }
    },
  });

  function draw() {
    const s = surface.current;
    if (!s) return;
    const ctx = s.beginFrame();
    const dt = 1 / 60;

    ctx.save();
    if (shakeRef.current > 0.1) {
      ctx.translate((Math.random() - 0.5) * shakeRef.current * 2, (Math.random() - 0.5) * shakeRef.current * 2);
      shakeRef.current *= 0.86;
    } else shakeRef.current = 0;

    // Dondurma örtüsü.
    if (sim.frozenLeft > 0) {
      ctx.fillStyle = 'rgba(86,180,233,0.10)';
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    }

    ctx.font = '600 11.5px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    for (const e of sim.entities) {
      const st = KIND_STYLE[e.kind];
      const age = sim.ticks - e.bornStep;
      const ready = age >= MIN_REACT_STEPS;
      const appear = Math.min(1, age / MIN_REACT_STEPS);
      const scale = 0.6 + 0.4 * (1 - (1 - appear) * (1 - appear));
      const w = CARD_W * scale;
      const h = CARD_H * scale;
      const x = e.x - w / 2;
      const y = e.y - h / 2;
      const bob = fx.canCelebrate() ? Math.sin((sim.ticks + e.id * 17) / 22) * 2 : 0;

      ctx.save();
      ctx.translate(0, bob);
      ctx.globalAlpha = ready ? 1 : 0.55 + 0.45 * appear;
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = st.fill;
      ctx.fill();
      // Desen (renk dışı ikinci kanal): bozukta çapraz çizgi.
      if (e.kind === 'corrupted') {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(230,159,0,0.18)';
        ctx.lineWidth = 3;
        for (let k = -h; k < w; k += 10) {
          ctx.beginPath();
          ctx.moveTo(x + k, y + h);
          ctx.lineTo(x + k + h, y);
          ctx.stroke();
        }
        ctx.restore();
      }
      roundRect(ctx, x, y, w, h, 12);
      ctx.lineWidth = e.kind === 'corrupted' ? 2.5 : 1.5;
      ctx.setLineDash(e.kind === 'genuine' ? [] : e.kind === 'corrupted' ? [] : [5, 3]);
      ctx.strokeStyle = st.stroke;
      ctx.stroke();
      ctx.setLineDash([]);

      if (scale > 0.95) {
        // Simge rozeti.
        ctx.beginPath();
        ctx.arc(x + 16, y + h / 2, 10, 0, Math.PI * 2);
        ctx.fillStyle = st.stroke;
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.textAlign = 'center';
        ctx.font = '800 12px system-ui, sans-serif';
        ctx.fillText(st.icon, x + 16, y + h / 2 + 0.5);
        // Metin.
        ctx.font = '600 11.5px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = st.text;
        const lines = wrap(ctx, entityLabel(e), w - 40);
        const lh = 14;
        const top = y + h / 2 - ((lines.length - 1) * lh) / 2 - 2;
        lines.forEach((l, i) => ctx.fillText(l, x + 31, top + i * lh));
        // Ömür çubuğu.
        const frac = Math.max(0, e.ttl / e.ttlMax);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + 10, y + h - 5, w - 20, 2.5);
        ctx.fillStyle = frac < 0.3 && e.kind === 'corrupted' ? '#ff6b6b' : st.stroke;
        ctx.fillRect(x + 10, y + h - 5, (w - 20) * frac, 2.5);
      }

      if (focusIdRef.current === e.id) {
        roundRect(ctx, x - 5, y - 5, w + 10, h + 10, 15);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Parçacıklar (kozmetik).
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
      p.vy = p.vy * 0.94 + 120 * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Yüzen metinler.
    ctx.textAlign = 'center';
    ctx.font = '800 15px system-ui, sans-serif';
    const fs = floats.current;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i];
      f.life += dt;
      if (f.life > 0.9) {
        fs.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - f.life / 0.9;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.text, f.x, f.y - f.life * 40);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.life * 40);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Can kaybı kenar parlaması (sarsıntıdan bağımsız, azaltılmışta da kısa ve sakin).
    const fl = flashRef.current;
    if (fl) {
      fl.life += dt;
      if (fl.life > 0.35) flashRef.current = null;
      else {
        ctx.strokeStyle = `${fl.color}${(0.6 * (1 - fl.life / 0.35)).toFixed(2)})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
      }
    }
  }

  // Bitişte / öğreticide son kareyi çiz (döngü durmuşken boş tuval kalmasın).
  useEffect(() => {
    if (running) return;
    const id = requestAnimationFrame(() => draw());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const startFromIntro = () => {
    markTutorialSeen();
    setIntro(false);
  };

  const hudSummary = useMemo(
    () =>
      t.hudSummary(hud.score, hud.lives, hud.timeLeft, hud.phase + 1, hud.rage),
    [hud, t]
  );

  return (
    <div className="mx-auto w-full max-w-[420px] select-none">
      {/* HUD */}
      <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-white">
        <div className="flex items-center gap-0.5" aria-label={c.lives(hud.lives, MAX_LIVES)}>
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Heart
              key={i}
              aria-hidden
              className="h-5 w-5"
              style={{ color: i < hud.lives ? '#ff6b6b' : '#52525b', fill: i < hud.lives ? '#ff6b6b' : 'transparent' }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 tabular-nums" style={{ color: accent }}>
            <Zap className="h-4 w-4" aria-hidden /> {hud.score}
            <span className="text-xs font-medium text-white/60">/ {config.rewardThreshold}</span>
          </span>
          {hud.combo >= 3 && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-[#F0E442]">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {hud.combo}×
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">{c.levelShort(hud.phase + 1)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs tabular-nums text-white/90">{c.seconds(hud.timeLeft)}</span>
        </div>
      </div>
      <div className="mb-2 flex h-5 items-center justify-center gap-2 text-[11px] font-bold">
        {hud.frozen > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-[#56B4E9]/20 px-2 py-0.5 text-[#bfe3f8]">
            <Snowflake className="h-3 w-3" aria-hidden /> {t.frozen(hud.frozen)}
          </span>
        )}
        {hud.double > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-[#F0E442]/20 px-2 py-0.5 text-[#fff9c4]">
            <Star className="h-3 w-3" aria-hidden /> {t.double(hud.double)}
          </span>
        )}
        {hud.rage && (
          <span className="flex items-center gap-1 rounded-full bg-[#ff6b6b]/25 px-2 py-0.5 text-[#ffd0d0]">
            <Flame className="h-3 w-3" aria-hidden /> {t.rageMode}
          </span>
        )}
        {mode === 'practice' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">{c.practice}</span>}
      </div>
      <p className="sr-only" aria-live="polite">
        {hudSummary}
      </p>

      {/* Arena */}
      <div
        className="relative w-full overflow-hidden rounded-2xl"
        style={{
          aspectRatio: `${ARENA_W} / ${ARENA_H}`,
          maxHeight: '68vh',
          background: rage
            ? 'radial-gradient(circle at 50% 46%, #4a0f1e 0%, #1a0612 50%, #070208 85%)'
            : 'radial-gradient(circle at 50% 46%, #2a0f52 0%, #12082b 50%, #050210 85%)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <Boss3D color={accent} rage={rage} hurt={hurt} paused={paused || !running} size={220} />
        </div>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          role="application"
          aria-roledescription={c.roleArena}
          aria-label={t.arenaLabel}
          tabIndex={0}
        />

        {intro && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mt-intro-title"
            className="absolute inset-0 z-10 flex flex-col justify-center gap-3 bg-black/80 p-5 text-white backdrop-blur-sm"
          >
            <h3 id="mt-intro-title" className="text-lg font-bold">
              {c.howTo}
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E69F00] text-xs font-black text-black">✕</span>
                <span><strong>{t.corruptTitle}</strong>{t.corruptBody}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#56B4E9] text-xs font-black text-black">✓</span>
                <span><strong>{t.genuineTitle}</strong>{t.genuineBody}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0E442] text-[10px] font-black text-black">★</span>
                <span><strong>{t.powerTitle}</strong>{t.powerBody}</span>
              </li>
              <li className="text-white/75">
                {t.rules}{' '}
                {mode === 'ranked' ? c.rankedReward(config.rewardThreshold) : c.practiceShort}
              </li>
              <li className="text-xs text-white/60">{t.keys}</li>
            </ul>
            <button
              type="button"
              autoFocus
              onClick={startFromIntro}
              className="mt-1 h-11 rounded-xl font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ background: accent }}
            >
              {c.gotIt}
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-center text-[11px] text-white/55">
        {t.legend}
      </p>
    </div>
  );
}
