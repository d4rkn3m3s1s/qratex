/**
 * Yorum İstifi — canvas çizimi + kozmetik efektler (yalnız istemci; skoru ETKİLEMEZ).
 *
 * Palet Okabe–Ito (renk körü güvenli) ve her parça türü AYRICA bir iç desen taşır (renk tek ayırt edici
 * değil): I çizgi, J sol köşe, L sağ köşe, O nokta, S eğik, T üçgen, Z ters eğik. Satır temizlenince
 * "onaylandı ✓" damgası soldan sağa süpürülür. Efekt sönümü süreye (ms) bağlı — ekran tazeleme hızından bağımsız.
 * `Math.random` burada serbest (parçacık saçılımı); mantık `sim.ts`'te.
 */
import { COLS, COUNTDOWN_TICKS, HZ, KINDS, ROWS, type PieceKind, type SimEvent, type StackSim } from './sim';

export const CELL = 20;
export const RS_W = COLS * CELL;
export const RS_H = ROWS * CELL;

export const PALETTE = {
  bg: '#0b1020',
  grid: 'rgba(255,255,255,0.05)',
  text: '#ffffff',
  accent: '#56B4E9',
  gold: '#F0E442',
  danger: '#ff6b6b',
} as const;

/** Parça renkleri (Okabe–Ito; koyu zeminde okunur tonlar). */
export const KIND_COLOR: Record<PieceKind, string> = {
  I: '#56B4E9',
  J: '#4a9fe0',
  L: '#E69F00',
  O: '#F0E442',
  S: '#009E73',
  T: '#CC79A7',
  Z: '#D55E00',
};

export const KIND_NAME: Record<PieceKind, string> = {
  I: 'Çubuk',
  J: 'J',
  L: 'L',
  O: 'Kare',
  S: 'S',
  T: 'T',
  Z: 'Z',
};

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
  stamps: { row: number; life: number; label: string }[];
  shake: number;
  flash: number;
  flashColor: string;
  last: number;
}

export function createFxState(): FxState {
  return { particles: [], stamps: [], shake: 0, flash: 0, flashColor: PALETTE.accent, last: 0 };
}

const CLEAR_LABEL = ['', 'Onaylandı ✓', 'Çift onay ✓✓', 'Üçlü onay ✓✓✓', 'İSTİF! ✓✓✓✓'];

export function applyEventsToFx(fx: FxState, events: SimEvent[], rich: boolean, shake: (px: number) => number) {
  for (const e of events) {
    if (e.t === 'clear') {
      for (const r of e.rows) fx.stamps.push({ row: r, life: 1, label: CLEAR_LABEL[e.n] ?? '' });
      fx.shake = Math.max(fx.shake, shake(1 + e.n));
      if (rich) {
        const count = e.n >= 4 ? 40 : 8 * e.n;
        for (let i = 0; i < count; i++) {
          const r = e.rows[i % e.rows.length];
          fx.particles.push({
            x: Math.random() * RS_W,
            y: r * CELL + CELL / 2,
            vx: (Math.random() - 0.5) * 3,
            vy: -Math.random() * 2.5,
            life: 1,
            color: e.n >= 4 ? PALETTE.gold : PALETTE.accent,
          });
        }
      }
    } else if (e.t === 'lock' && e.hard) {
      fx.shake = Math.max(fx.shake, shake(1.5));
    } else if (e.t === 'level') {
      fx.flash = 1;
      fx.flashColor = PALETTE.accent;
    } else if (e.t === 'threshold') {
      fx.flash = 1;
      fx.flashColor = PALETTE.gold;
    } else if (e.t === 'over' && e.cause === 'topout') {
      fx.shake = Math.max(fx.shake, shake(5));
      fx.flash = 1;
      fx.flashColor = PALETTE.danger;
    }
  }
}

/** Parça türüne özgü iç desen (renk körü güvenliği). */
function drawGlyph(ctx: CanvasRenderingContext2D, kind: PieceKind, x: number, y: number, s: number) {
  const c = s / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(11,16,32,0.55)';
  ctx.fillStyle = 'rgba(11,16,32,0.55)';
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  ctx.beginPath();
  switch (kind) {
    case 'I':
      ctx.moveTo(s * 0.25, c);
      ctx.lineTo(s * 0.75, c);
      ctx.stroke();
      break;
    case 'J':
      ctx.moveTo(s * 0.3, s * 0.3);
      ctx.lineTo(s * 0.3, s * 0.7);
      ctx.lineTo(s * 0.7, s * 0.7);
      ctx.stroke();
      break;
    case 'L':
      ctx.moveTo(s * 0.7, s * 0.3);
      ctx.lineTo(s * 0.7, s * 0.7);
      ctx.lineTo(s * 0.3, s * 0.7);
      ctx.stroke();
      break;
    case 'O':
      ctx.arc(c, c, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'S':
      ctx.moveTo(s * 0.28, s * 0.72);
      ctx.lineTo(s * 0.72, s * 0.28);
      ctx.stroke();
      break;
    case 'T':
      ctx.moveTo(c, s * 0.28);
      ctx.lineTo(s * 0.72, s * 0.68);
      ctx.lineTo(s * 0.28, s * 0.68);
      ctx.closePath();
      ctx.fill();
      break;
    case 'Z':
      ctx.moveTo(s * 0.28, s * 0.28);
      ctx.lineTo(s * 0.72, s * 0.72);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export function drawBlock(ctx: CanvasRenderingContext2D, kind: PieceKind, x: number, y: number, s: number, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = KIND_COLOR[kind];
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  // Üst parlaklık (ucuz "neon" — shadowBlur kullanılmaz).
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.18));
  drawGlyph(ctx, kind, x, y, s);
  ctx.globalAlpha = 1;
}

export interface DrawOpts {
  rich: boolean;
  now: number;
}

export function drawFrame(ctx: CanvasRenderingContext2D | null | undefined, sim: StackSim, fx: FxState, o: DrawOpts) {
  if (!ctx) return;
  const dt = fx.last ? Math.min(100, o.now - fx.last) : 16;
  fx.last = o.now;
  const k = dt / 16.67;

  ctx.save();
  if (fx.shake > 0.1) {
    ctx.translate((Math.random() - 0.5) * fx.shake * 2, (Math.random() - 0.5) * fx.shake * 2);
    fx.shake *= Math.pow(0.85, k);
  } else fx.shake = 0;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(-10, -10, RS_W + 20, RS_H + 20);

  // Izgara.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, RS_H);
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(RS_W, y * CELL + 0.5);
  }
  ctx.stroke();

  // Yerleşmiş bloklar.
  const b = sim.board;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = b[y * COLS + x];
      if (v) drawBlock(ctx, KINDS[v - 1], x * CELL, y * CELL, CELL);
    }
  }

  // Hayalet + aktif parça.
  const p = sim.piece;
  if (p && sim.countdown === 0) {
    const gy = sim.ghostY();
    if (gy !== p.y) {
      ctx.strokeStyle = KIND_COLOR[p.kind];
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      for (const [x, y] of sim.cellsOf({ ...p, y: gy })) {
        if (y >= 0) ctx.strokeRect(x * CELL + 2.5, y * CELL + 2.5, CELL - 5, CELL - 5);
      }
      ctx.setLineDash([]);
    }
    for (const [x, y] of sim.cellsOf(p)) {
      if (y >= 0) drawBlock(ctx, p.kind, x * CELL, y * CELL, CELL);
    }
  }

  // Onay damgası süpürmesi.
  for (const s of fx.stamps) {
    const y = s.row * CELL;
    const sweep = Math.min(1, (1 - s.life) * 4);
    ctx.fillStyle = `rgba(255,255,255,${0.55 * s.life})`;
    ctx.fillRect(0, y, RS_W * sweep, CELL);
    if (s.label) {
      ctx.globalAlpha = Math.min(1, s.life * 1.5);
      ctx.fillStyle = PALETTE.bg;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, RS_W / 2, y + CELL / 2);
      ctx.globalAlpha = 1;
    }
    s.life -= 0.035 * k;
  }
  fx.stamps = fx.stamps.filter((s) => s.life > 0);

  // Parçacıklar.
  if (o.rich) {
    for (const q of fx.particles) {
      q.x += q.vx * k;
      q.y += q.vy * k;
      q.vy += 0.08 * k;
      q.life -= 0.025 * k;
      ctx.globalAlpha = Math.max(0, q.life);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
  fx.particles = fx.particles.filter((q) => q.life > 0);

  // Geri sayım.
  if (sim.countdown > 0) {
    ctx.fillStyle = 'rgba(11,16,32,0.6)';
    ctx.fillRect(0, 0, RS_W, RS_H);
    const n = Math.ceil(sim.countdown / HZ);
    const frac = (sim.countdown % HZ) / HZ;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `900 ${o.rich ? 48 + frac * 16 : 56}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.min(n, COUNTDOWN_TICKS / HZ)), RS_W / 2, RS_H / 2);
  }

  // Seviye/eşik flaşı.
  if (fx.flash > 0) {
    ctx.globalAlpha = fx.flash * 0.25;
    ctx.fillStyle = fx.flashColor;
    ctx.fillRect(0, 0, RS_W, RS_H);
    ctx.globalAlpha = 1;
    fx.flash = Math.max(0, fx.flash - 0.04 * k);
  }
  ctx.restore();
}
