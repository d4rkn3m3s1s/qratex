/**
 * Veri Yılanı — canvas çizimi + kozmetik efektler (yalnız istemci; skoru ETKİLEMEZ).
 *
 * Palet Okabe–Ito (renk körü güvenli) ve her öğe AYRI ŞEKİL taşır:
 *   yılan = yuvarlak gövde + gözlü baş (mavimsi yeşil), veri paketi = elmas + iç çizgi (sarı),
 *   bot duvarı = çapraz taralı kare (turuncu-kızıl), devriye botu = antenli robot yüzü (pembe).
 * `Math.random` burada serbest (parçacık saçılımı); mantık `sim.ts`'te.
 */
import {
  CELL,
  COUNTDOWN_TICKS,
  DS_H,
  DS_W,
  GRID,
  HZ,
  cellX,
  cellY,
  type SimEvent,
  type SnakeSim,
} from './sim';

export const PALETTE = {
  bg: '#0b1020',
  grid: 'rgba(255,255,255,0.045)',
  head: '#009E73',
  body: '#2fbf8f',
  bodyDim: '#1d6b55',
  food: '#F0E442',
  wall: '#D55E00',
  bot: '#CC79A7',
  danger: '#ff4d4d',
  text: '#ffffff',
  accent: '#56B4E9',
} as const;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface FxState {
  particles: Particle[];
  rings: { x: number; y: number; life: number }[];
  shake: number;
  flash: number;
  flashColor: string;
}

export function createFxState(): FxState {
  return { particles: [], rings: [], shake: 0, flash: 0, flashColor: PALETTE.accent };
}

const center = (c: number) => ({ x: cellX(c) * CELL + CELL / 2, y: cellY(c) * CELL + CELL / 2 });

export function applyEventsToFx(fx: FxState, events: SimEvent[], rich: boolean, shake: (px: number) => number) {
  for (const e of events) {
    if (e.t === 'eat') {
      const p = center(e.cell);
      fx.rings.push({ x: p.x, y: p.y, life: 1 });
      if (rich) {
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 0.8 + Math.random() * 1.6;
          fx.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: PALETTE.food });
        }
      }
    } else if (e.t === 'level') {
      fx.flash = 1;
      fx.flashColor = PALETTE.accent;
    } else if (e.t === 'threshold') {
      fx.flash = 1;
      fx.flashColor = PALETTE.food;
    } else if (e.t === 'die') {
      fx.shake = Math.max(fx.shake, shake(6));
      if (rich) {
        const p = center(e.cell);
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 1 + Math.random() * 2.2;
          fx.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: PALETTE.danger });
        }
      }
    } else if (e.t === 'clear') {
      fx.flash = 1;
      fx.flashColor = PALETTE.food;
    }
  }
}

export function stepFx(fx: FxState) {
  for (const p of fx.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= 1 / 36;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const r of fx.rings) r.life -= 1 / 24;
  fx.rings = fx.rings.filter((r) => r.life > 0);
  fx.shake *= 0.85;
  if (fx.shake < 0.2) fx.shake = 0;
  fx.flash = Math.max(0, fx.flash - 1 / 40);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Bir hücreden diğerine ara konum (komşu değilse — ör. ilk kare — doğrudan hedef). */
function lerpCell(from: number | undefined, to: number, t: number) {
  const b = center(to);
  if (from === undefined) return b;
  const a = center(from);
  if (Math.abs(a.x - b.x) > CELL || Math.abs(a.y - b.y) > CELL) return b;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function drawFrame(ctx: CanvasRenderingContext2D, sim: SnakeSim, fx: FxState, opts: { smooth: boolean; now: number }) {
  ctx.save();
  if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * 2, (Math.random() - 0.5) * fx.shake * 2);

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(-10, -10, DS_W + 20, DS_H + 20);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < GRID; i++) {
    ctx.moveTo(i * CELL + 0.5, 0);
    ctx.lineTo(i * CELL + 0.5, DS_H);
    ctx.moveTo(0, i * CELL + 0.5);
    ctx.lineTo(DS_W, i * CELL + 0.5);
  }
  ctx.stroke();

  // Bot duvarları: taralı kare.
  for (const c of sim.walls) {
    const x = cellX(c) * CELL;
    const y = cellY(c) * CELL;
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = 'rgba(11,16,32,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + CELL - 4);
    ctx.lineTo(x + CELL - 4, y + 4);
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + CELL - 4, y + CELL - 4);
    ctx.stroke();
  }

  // Devriye yolları (soluk) + botlar.
  const moveT = sim.phase === 'play' ? 1 - sim.moveTimer / sim.moveTicks : 1;
  for (let i = 0; i < sim.bots.length; i++) {
    const b = sim.bots[i];
    ctx.fillStyle = 'rgba(204,121,167,0.10)';
    for (const c of b.path) ctx.fillRect(cellX(c) * CELL + 3, cellY(c) * CELL + 3, CELL - 6, CELL - 6);
    const p = opts.smooth ? lerpCell(sim.prevBots[i], b.path[b.idx], moveT) : center(b.path[b.idx]);
    ctx.fillStyle = PALETTE.bot;
    ctx.beginPath();
    ctx.roundRect(p.x - 8, p.y - 7, 16, 14, 3);
    ctx.fill();
    ctx.strokeStyle = PALETTE.bot;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 7);
    ctx.lineTo(p.x, p.y - 10);
    ctx.stroke();
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(p.x - 5, p.y - 3, 3, 3);
    ctx.fillRect(p.x + 2, p.y - 3, 3, 3);
    ctx.fillRect(p.x - 4, p.y + 2, 8, 2);
  }

  // Veri paketi: nabızlı elmas.
  if (sim.food >= 0) {
    const p = center(sim.food);
    const pulse = opts.smooth ? 1 + Math.sin(opts.now / 180) * 0.12 : 1;
    const r = 7 * pulse;
    ctx.fillStyle = 'rgba(240,228,66,0.18)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.food;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.bg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - r / 2, p.y);
    ctx.lineTo(p.x + r / 2, p.y);
    ctx.stroke();
  }

  // Yılan.
  const dying = sim.phase === 'dying' || (sim.phase === 'over' && sim.cause !== null);
  const t = opts.smooth && !dying ? moveT : 1;
  const segs = sim.snake;
  const prev = sim.prevSnake;
  for (let i = segs.length - 1; i >= 0; i--) {
    const p = lerpCell(prev[i] ?? prev[prev.length - 1], segs[i], t);
    const isHead = i === 0;
    ctx.fillStyle = dying ? PALETTE.bodyDim : isHead ? PALETTE.head : PALETTE.body;
    const rad = isHead ? 9 : 7.5 - Math.min(2.5, (i / Math.max(1, segs.length)) * 2.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
    if (isHead) {
      const dx = sim.dir === 3 ? -1 : sim.dir === 4 ? 1 : 0;
      const dy = sim.dir === 1 ? -1 : sim.dir === 2 ? 1 : 0;
      const ox = dy !== 0 ? 4 : 0;
      const oy = dx !== 0 ? 4 : 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x + dx * 3 + ox, p.y + dy * 3 + oy, 2.6, 0, Math.PI * 2);
      ctx.arc(p.x + dx * 3 - ox, p.y + dy * 3 - oy, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.bg;
      ctx.beginPath();
      ctx.arc(p.x + dx * 4 + ox, p.y + dy * 4 + oy, 1.2, 0, Math.PI * 2);
      ctx.arc(p.x + dx * 4 - ox, p.y + dy * 4 - oy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Çarpma noktası: kırmızı halka + X (renk tek ipucu değil).
  if (dying && sim.deathCell >= 0) {
    const p = center(sim.deathCell);
    const blink = opts.smooth ? 0.6 + 0.4 * Math.sin(opts.now / 70) : 1;
    ctx.strokeStyle = PALETTE.danger;
    ctx.globalAlpha = blink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.moveTo(p.x - 6, p.y - 6);
    ctx.lineTo(p.x + 6, p.y + 6);
    ctx.moveTo(p.x + 6, p.y - 6);
    ctx.lineTo(p.x - 6, p.y + 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const r of fx.rings) {
    ctx.strokeStyle = `rgba(240,228,66,${r.life})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 8 + (1 - r.life) * 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  if (fx.flash > 0) {
    ctx.strokeStyle = fx.flashColor;
    ctx.globalAlpha = fx.flash;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, DS_W - 6, DS_H - 6);
    ctx.globalAlpha = 1;
  }

  // Faz yazıları.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (sim.phase === 'countdown') {
    const n = Math.max(1, Math.ceil(sim.phaseTicks / HZ));
    ctx.fillStyle = 'rgba(11,16,32,0.55)';
    ctx.fillRect(0, 0, DS_W, DS_H);
    ctx.fillStyle = PALETTE.text;
    const k = opts.smooth ? 1 + ((sim.phaseTicks % HZ) / HZ) * 0.25 : 1;
    ctx.font = `900 ${Math.round(72 * k)}px system-ui, sans-serif`;
    ctx.fillText(String(n), DS_W / 2, DS_H / 2 - 10);
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(sim.phaseTicks > COUNTDOWN_TICKS - 20 ? 'Hazır ol' : 'Yön seçebilirsin', DS_W / 2, DS_H / 2 + 42);
  } else if (sim.phase === 'levelup') {
    ctx.fillStyle = 'rgba(11,16,32,0.45)';
    ctx.fillRect(0, DS_H / 2 - 40, DS_W, 80);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(`Seviye ${sim.level}`, DS_W / 2, DS_H / 2 - 8);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(
      sim.bots.length ? 'Devriye botları sahada — yollarına girme' : 'Yeni bot duvarları belirdi',
      DS_W / 2,
      DS_H / 2 + 18
    );
  }
  ctx.restore();
}
