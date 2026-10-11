/**
 * Yıldız Avı — canvas çizimi (yalnız istemci; simülasyonu OKUR, değiştirmez).
 *
 * Performans (rapor bulgu 9): statik labirent her karede yeniden çizilmez; labirent + DPR
 * ölçeğine göre bir kez gizli canvas'a çizilir, karede `drawImage` ile basılır. Kare içinde
 * `shadowBlur` yok; ışıma yarı saydam dairelerle.
 *
 * Erişilebilirlik: renk tek ayırt edici değil — her hayaletin kendine özgü biçimi var (kubbe,
 * boynuz, düz tepe, anten), korkmuş hayalet kesik kenarlı ve zikzak ağızlı; yıldız beş köşeli,
 * güç kapsülü halka. Palet Okabe–Ito (renk körü güvenli).
 */
import { STAR_CANVAS_TEXTS_TR, type StarCanvasTexts } from './copy';
import {
  CELL_PX,
  CELL_U,
  COLS,
  ROWS,
  SH_H,
  SH_W,
  getMaze,
  moverPos,
  type SimEvent,
  type StarHuntSim,
} from './sim';

export const PALETTE = {
  bg: '#0b1020',
  wall: '#1e2a6b',
  wallEdge: '#56B4E9',
  player: '#F0E442',
  star: '#E69F00',
  pellet: '#56B4E9',
  scared: '#dbeafe',
  danger: '#D55E00',
  ghosts: ['#D55E00', '#CC79A7', '#009E73', '#0072B2'] as const,
  text: '#ffffff',
};

export const GHOST_NAMES = ['Kovalayıcı', 'Pusucu', 'Gezgin', 'Çekingen'] as const;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export interface FxState {
  particles: Particle[];
  floaters: Floater[];
  shake: number;
  vignette: number;
  flash: number;
  frame: number;
  rich: boolean;
}

export function createFxState(rich: boolean): FxState {
  return { particles: [], floaters: [], shake: 0, vignette: 0, flash: 0, frame: 0, rich };
}

const cellCenter = (c: number) => c * CELL_PX + CELL_PX / 2;

function burst(fx: FxState, x: number, y: number, color: string, n: number) {
  if (!fx.rich) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2; // kozmetik
    const s = 0.6 + Math.random() * 2.2;
    fx.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 26 + Math.random() * 18, color, size: 1.5 + Math.random() * 2 });
  }
  if (fx.particles.length > 260) fx.particles.splice(0, fx.particles.length - 260);
}

/** Simülasyon olaylarını görsel efekte çevirir. `shake(px)` politika süzgecidir (azaltılmışta 0). */
export function applyEventsToFx(
  fx: FxState,
  events: SimEvent[],
  shake: (px: number) => number,
  texts: StarCanvasTexts = STAR_CANVAS_TEXTS_TR
) {
  for (const e of events) {
    switch (e.t) {
      case 'star': {
        const x = cellCenter(e.x);
        const y = cellCenter(e.y);
        burst(fx, x, y, PALETTE.star, 18);
        fx.floaters.push({ x, y, text: '+1 ★', life: 50, color: PALETTE.star });
        fx.shake = Math.max(fx.shake, shake(3));
        break;
      }
      case 'pellet':
        burst(fx, cellCenter(e.x), cellCenter(e.y), PALETTE.pellet, 22);
        fx.flash = 10;
        fx.shake = Math.max(fx.shake, shake(4));
        break;
      case 'eat': {
        const x = e.x * CELL_PX + CELL_PX / 2;
        const y = e.y * CELL_PX + CELL_PX / 2;
        burst(fx, x, y, PALETTE.scared, 20);
        fx.floaters.push({ x, y, text: texts.caught(e.chain), life: 55, color: PALETTE.pellet });
        fx.shake = Math.max(fx.shake, shake(4));
        break;
      }
      case 'caught':
        burst(fx, e.x * CELL_PX + CELL_PX / 2, e.y * CELL_PX + CELL_PX / 2, PALETTE.danger, 26);
        fx.vignette = 40;
        fx.shake = Math.max(fx.shake, shake(7));
        break;
      default:
        break;
    }
  }
}

export function stepFx(fx: FxState) {
  fx.frame += 1;
  fx.shake *= 0.86;
  if (fx.shake < 0.3) fx.shake = 0;
  if (fx.vignette > 0) fx.vignette -= 1;
  if (fx.flash > 0) fx.flash -= 1;
  for (const p of fx.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life += 1;
  }
  fx.particles = fx.particles.filter((p) => p.life < p.max);
  for (const f of fx.floaters) {
    f.life -= 1;
    f.y -= 0.5;
  }
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
}

// ─────────────── Labirent önbelleği ───────────────
const mazeCache = new Map<string, HTMLCanvasElement>();

function mazeLayer(index: number, scale: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${index}@${scale.toFixed(3)}`;
  const hit = mazeCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(SH_W * scale));
  c.height = Math.max(1, Math.round(SH_H * scale));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const mz = getMaze(index);
  const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && mz.walls[y * COLS + x] === 1;
  // Zemin noktaları (yol ızgarası, hafif).
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) if (!wall(x, y)) ctx.fillRect(cellCenter(x) - 1, cellCenter(y) - 1, 2, 2);
  // Duvar gövdesi.
  ctx.fillStyle = PALETTE.wall;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) if (wall(x, y)) ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
  // Neon kenar: yalnız yola bakan kenarlar (bir kez, ışımalı).
  ctx.strokeStyle = PALETTE.wallEdge;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.shadowColor = PALETTE.wallEdge;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!wall(x, y)) continue;
      const l = x * CELL_PX + 2;
      const r = (x + 1) * CELL_PX - 2;
      const t = y * CELL_PX + 2;
      const b = (y + 1) * CELL_PX - 2;
      if (y > 0 && !wall(x, y - 1)) (ctx.moveTo(l, t), ctx.lineTo(r, t));
      if (y < ROWS - 1 && !wall(x, y + 1)) (ctx.moveTo(l, b), ctx.lineTo(r, b));
      if (x > 0 && !wall(x - 1, y)) (ctx.moveTo(l, t), ctx.lineTo(l, b));
      if (x < COLS - 1 && !wall(x + 1, y)) (ctx.moveTo(r, t), ctx.lineTo(r, b));
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Hayalet evi işareti.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(mz.home.x * CELL_PX + 3, mz.home.y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6);
  ctx.setLineDash([]);
  if (mazeCache.size > 12) mazeCache.clear();
  mazeCache.set(key, c);
  return c;
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, id: number, scared: boolean, flashing: boolean, dim: boolean, frame: number) {
  const r = CELL_PX * 0.42;
  const color = scared ? (flashing ? '#ffffff' : PALETTE.scared) : PALETTE.ghosts[id % 4];
  ctx.save();
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  const top = y - r;
  const kind = id % 4;
  // Tepe biçimi = kimlik (renkten bağımsız).
  if (kind === 1) {
    // boynuzlu
    ctx.moveTo(x - r, y);
    ctx.lineTo(x - r, top + r * 0.3);
    ctx.lineTo(x - r * 0.55, top - r * 0.25);
    ctx.lineTo(x - r * 0.2, top + r * 0.1);
    ctx.lineTo(x + r * 0.2, top + r * 0.1);
    ctx.lineTo(x + r * 0.55, top - r * 0.25);
    ctx.lineTo(x + r, top + r * 0.3);
  } else if (kind === 2) {
    // düz tepe
    ctx.moveTo(x - r, y);
    ctx.lineTo(x - r, top + r * 0.15);
    ctx.lineTo(x + r, top + r * 0.15);
  } else {
    ctx.moveTo(x - r, y);
    ctx.arc(x, y, r, Math.PI, 0);
  }
  ctx.lineTo(x + r, y + r);
  // Etek (dalgalı).
  const waves = 4;
  const wob = scared || kind === 3 ? Math.sin(frame / 5) * 1.5 : 0;
  for (let i = waves; i >= 0; i--) {
    const px = x - r + (2 * r * i) / waves;
    ctx.lineTo(px, y + r - (i % 2 === 0 ? 0 : r * 0.3) + wob);
  }
  ctx.closePath();
  ctx.fill();
  if (scared) {
    ctx.strokeStyle = '#0b1020';
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    // zikzak ağız + nokta gözler
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(x - r * 0.4, y - r * 0.3, 3, 3);
    ctx.fillRect(x + r * 0.4 - 3, y - r * 0.3, 3, 3);
    ctx.strokeStyle = '#0b1020';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const px = x - r * 0.5 + (r * i) / 4;
      const py = y + r * 0.3 + (i % 2 === 0 ? 0 : -3);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.15, r * 0.26, 0, Math.PI * 2);
    ctx.arc(x + r * 0.35, y - r * 0.15, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.12, r * 0.12, 0, Math.PI * 2);
    ctx.arc(x + r * 0.4, y - r * 0.12, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 3) {
      // anten
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top - r * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, top - r * 0.5, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
  ctx.restore();
}

const ANGLE: readonly number[] = [0, -Math.PI / 2, Math.PI / 2, Math.PI, 0];

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scale: number,
  sim: StarHuntSim,
  fx: FxState,
  lastDir: number,
  texts: StarCanvasTexts = STAR_CANVAS_TEXTS_TR
) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, SH_W, SH_H);
  ctx.save();
  if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * 2, (Math.random() - 0.5) * fx.shake * 2);

  const layer = mazeLayer(sim.spec.maze, scale);
  if (layer) ctx.drawImage(layer, 0, 0, SH_W, SH_H);

  const f = fx.frame;
  // Güç kapsülleri (halka).
  sim.maze.pellets.forEach((p, i) => {
    if (sim.pelletsTaken[i]) return;
    const x = cellCenter(p.x);
    const y = cellCenter(p.y);
    const pulse = fx.rich ? 1 + Math.sin(f / 8) * 0.15 : 1;
    ctx.fillStyle = 'rgba(86,180,233,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, 10 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.pellet;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 6 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  });
  // Yıldızlar.
  sim.maze.stars.forEach((s, i) => {
    if (sim.starsTaken[i]) return;
    const x = cellCenter(s.x);
    const y = cellCenter(s.y);
    ctx.fillStyle = 'rgba(230,159,0,0.2)';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    starPath(ctx, x, y, 9, fx.rich ? f / 40 : 0);
    ctx.fillStyle = PALETTE.star;
    ctx.fill();
    ctx.strokeStyle = '#fff3c4';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Hayaletler.
  const flashing = sim.powerTicks > 0 && sim.powerTicks < 96 && Math.floor(sim.powerTicks / 8) % 2 === 0;
  for (const g of sim.ghosts) {
    const p = moverPos(g);
    const x = (p.x / CELL_U) * CELL_PX + CELL_PX / 2;
    const y = (p.y / CELL_U) * CELL_PX + CELL_PX / 2;
    drawGhost(ctx, x, y, g.id, g.scared, flashing, g.state === 'home', f);
  }

  // Oyuncu.
  if (!(sim.phase === 'caught' && Math.floor(sim.phaseTicks / 6) % 2 === 0)) {
    const p = moverPos(sim.player);
    const x = (p.x / CELL_U) * CELL_PX + CELL_PX / 2;
    const y = (p.y / CELL_U) * CELL_PX + CELL_PX / 2;
    const r = CELL_PX * 0.42;
    const moving = sim.phase === 'play' && sim.player.dir !== 0;
    const mouth = moving && fx.rich ? 0.12 + Math.abs(Math.sin(f / 4)) * 0.5 : 0.35;
    const ang = ANGLE[sim.player.dir || lastDir || 4];
    if (sim.powerTicks > 0) {
      ctx.fillStyle = 'rgba(240,228,66,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, ang + mouth, ang + Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b1020';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Parçacıklar + yüzen yazılar.
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px system-ui, sans-serif';
  for (const fl of fx.floaters) {
    ctx.globalAlpha = Math.min(1, fl.life / 20);
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.text, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Güç kapsülü flaşı / yakalanma vinyeti.
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(86,180,233,${(fx.flash / 10) * 0.18})`;
    ctx.fillRect(0, 0, SH_W, SH_H);
  }
  if (fx.vignette > 0) {
    const g = ctx.createRadialGradient(SH_W / 2, SH_H / 2, SH_H * 0.25, SH_W / 2, SH_H / 2, SH_H * 0.7);
    g.addColorStop(0, 'rgba(213,94,0,0)');
    g.addColorStop(1, `rgba(213,94,0,${(fx.vignette / 40) * 0.55})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SH_W, SH_H);
  }

  // Faz yazıları.
  const banner = (title: string, sub?: string) => {
    ctx.fillStyle = 'rgba(11,16,32,0.72)';
    ctx.fillRect(0, SH_H / 2 - 34, SH_W, sub ? 68 : 48);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(title, SH_W / 2, SH_H / 2 - (sub ? 10 : 10));
    if (sub) {
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(sub, SH_W / 2, SH_H / 2 + 16);
    }
  };
  if (sim.phase === 'ready') banner(texts.ready(sim.level, sim.maze.name), texts.readySub);
  else if (sim.phase === 'clear') banner(texts.clear(sim.level), sim.level < 5 ? texts.nextMaze : texts.allDone);
  else if (sim.phase === 'caught') banner(texts.caughtBanner, sim.lives > 0 ? texts.livesLeft(sim.lives) : texts.noLives);
}
