/**
 * Spam Kırıcı — canvas çizimi + kozmetik efektler (yalnız istemci; skoru ETKİLEMEZ).
 *
 * Palet Okabe–Ito (renk körü güvenli) ve her öğe AYRI ŞEKİL/İŞARET taşır:
 *   spam tuğlası = turuncu + "@" işareti, bot tuğlası = mavi + iki göz (hasar alınca çatlak),
 *   kalkan = açık mavi kapsül, top = beyaz daire, kapsüller = sarı "↔" (geniş) / pembe "+" (can).
 * `Math.random` burada serbest (parçacık saçılımı); mantık `sim.ts`'te. `shadowBlur` YOK (pahalı).
 */
import {
  BALL_R,
  CAPSULE_H,
  CAPSULE_W,
  PADDLE_H,
  PADDLE_Y,
  SB_H,
  SB_W,
  SERVE_AUTO_TICKS,
  HZ,
  LEVELS,
  type BreakerSim,
  type SimEvent,
} from './sim';

export const PALETTE = {
  bg: '#0b1020',
  grid: 'rgba(255,255,255,0.04)',
  spam: '#E69F00',
  bot: '#0072B2',
  botLight: '#3b9ad9',
  paddle: '#56B4E9',
  ball: '#ffffff',
  wide: '#F0E442',
  life: '#CC79A7',
  danger: '#ff4d4d',
  good: '#009E73',
  text: '#ffffff',
} as const;

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
}

export const createFxState = (): FxState => ({ particles: [], floaters: [], shake: 0, vignette: 0, flash: 0 });

/** Olayları kozmetik efekte çevirir. `rich` false (azaltılmış hareket) → parçacık/sarsıntı yok. */
export function applyEventsToFx(fx: FxState, events: SimEvent[], rich: boolean, shake: (px: number) => number) {
  for (const e of events) {
    if (e.t === 'hit') {
      if (rich) {
        const n = e.destroyed ? 8 : 3;
        const color = e.kind === 2 ? PALETTE.botLight : PALETTE.spam;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 0.8 + Math.random() * 2.2;
          fx.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 26 + Math.random() * 14, color, size: 2 + Math.random() * 2 });
        }
      }
      fx.floaters.push({ x: e.x, y: e.y, text: '+1', life: 0, color: PALETTE.text });
      if (e.destroyed && e.kind === 2) fx.shake = Math.max(fx.shake, shake(3));
    } else if (e.t === 'lose') {
      fx.vignette = 1;
      fx.shake = Math.max(fx.shake, shake(4));
    } else if (e.t === 'catch') {
      fx.flash = 1;
      fx.floaters.push({ x: SB_W / 2, y: PADDLE_Y - 30, text: e.kind === 'wide' ? 'Geniş kalkan!' : '+1 can', life: 0, color: e.kind === 'wide' ? PALETTE.wide : PALETTE.life });
    } else if (e.t === 'threshold') {
      fx.floaters.push({ x: SB_W / 2, y: SB_H / 2, text: 'Ödül eşiği geçildi!', life: 0, color: PALETTE.good });
    }
  }
  if (fx.particles.length > 220) fx.particles.splice(0, fx.particles.length - 220);
}

/** Efekt saati (~60 Hz rAF). */
export function stepFx(fx: FxState) {
  for (const p of fx.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life++;
  }
  fx.particles = fx.particles.filter((p) => p.life < p.max);
  for (const f of fx.floaters) {
    f.y -= 0.6;
    f.life++;
  }
  fx.floaters = fx.floaters.filter((f) => f.life < 50);
  fx.shake *= 0.85;
  if (fx.shake < 0.2) fx.shake = 0;
  fx.vignette = Math.max(0, fx.vignette - 0.04);
  fx.flash = Math.max(0, fx.flash - 0.05);
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

export function drawFrame(ctx: CanvasRenderingContext2D, sim: BreakerSim, fx: FxState, opts: { coarse: boolean }) {
  ctx.save();
  if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * 2, (Math.random() - 0.5) * fx.shake * 2);

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(-8, -8, SB_W + 16, SB_H + 16);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  for (let y = 24; y < SB_H; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SB_W, y);
    ctx.stroke();
  }

  // Tuğlalar
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of sim.bricks) {
    const isBot = b.kind === 2;
    ctx.fillStyle = isBot ? PALETTE.bot : PALETTE.spam;
    roundRect(ctx, b.x, b.y, b.w, b.h, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 3);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (isBot) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 8, cy - 2, 4, 4);
      ctx.fillRect(cx + 4, cy - 2, 4, 4);
      if (b.hp < 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + 2);
        ctx.lineTo(b.x + 12, b.y + 9);
        ctx.lineTo(b.x + 9, b.y + b.h - 2);
        ctx.moveTo(b.x + b.w - 5, b.y + 3);
        ctx.lineTo(b.x + b.w - 11, b.y + 10);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#1a1206';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('@', cx, cy + 1);
    }
    if (b.capsule) {
      ctx.fillStyle = b.capsule === 'wide' ? PALETTE.wide : PALETTE.life;
      ctx.beginPath();
      ctx.arc(b.x + b.w - 5, b.y + 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Kapsüller
  for (const c of sim.capsules) {
    const wide = c.kind === 'wide';
    ctx.fillStyle = wide ? PALETTE.wide : PALETTE.life;
    roundRect(ctx, c.x - CAPSULE_W / 2, c.y, CAPSULE_W, CAPSULE_H, 6);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(wide ? '↔' : '+', c.x, c.y + CAPSULE_H / 2 + 1);
  }

  // Kalkan
  const pw = sim.paddleW;
  ctx.fillStyle = sim.wideTicks > 0 && sim.wideTicks < HZ * 2 && Math.floor(sim.tick / 8) % 2 === 0 ? PALETTE.wide : PALETTE.paddle;
  roundRect(ctx, sim.paddleX - pw / 2, PADDLE_Y, pw, PADDLE_H, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(sim.paddleX - pw / 2 + 6, PADDLE_Y + 2, pw - 12, 2);

  // Can çizgisi (alt kenar): kalan can kadar parça
  for (let i = 0; i < sim.lives; i++) {
    ctx.fillStyle = PALETTE.good;
    ctx.fillRect(8 + i * 22, SB_H - 8, 16, 3);
  }

  // Top
  if (sim.phase !== 'lost' && sim.phase !== 'over') {
    ctx.fillStyle = PALETTE.ball;
    ctx.beginPath();
    ctx.arc(sim.ballX, sim.ballY, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.bg;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Parçacık + yüzen metin
  for (const p of fx.particles) {
    ctx.globalAlpha = 1 - p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const f of fx.floaters) {
    ctx.globalAlpha = 1 - f.life / 50;
    ctx.fillStyle = f.color;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  // Evre metinleri
  ctx.fillStyle = PALETTE.text;
  if (sim.phase === 'serve') {
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`Seviye ${sim.level} / ${LEVELS}`, SB_W / 2, SB_H / 2 + 20);
    ctx.font = '13px system-ui, sans-serif';
    const left = Math.ceil(sim.phaseTicks / HZ);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(
      `${opts.coarse ? 'Dokunup bırak' : 'Boşluk / tıkla'}: fırlat · ${Math.min(left, SERVE_AUTO_TICKS / HZ)}`,
      SB_W / 2,
      SB_H / 2 + 42
    );
  } else if (sim.phase === 'levelup') {
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.good;
    ctx.fillText('Seviye temizlendi!', SB_W / 2, SB_H / 2);
  }

  if (fx.vignette > 0) {
    const g = ctx.createRadialGradient(SB_W / 2, SB_H / 2, SB_H * 0.25, SB_W / 2, SB_H / 2, SB_H * 0.7);
    g.addColorStop(0, 'rgba(255,77,77,0)');
    g.addColorStop(1, `rgba(255,77,77,${0.45 * fx.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SB_W, SB_H);
  }
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.12 * fx.flash})`;
    ctx.fillRect(0, 0, SB_W, SB_H);
  }
  ctx.restore();
}
