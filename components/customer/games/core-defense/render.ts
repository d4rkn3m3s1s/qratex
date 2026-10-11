/**
 * Çekirdek Savunması — canvas çizimi + kozmetik efektler (yalnız istemci).
 *
 * Renk paleti Okabe–Ito (renk körü güvenli) ve her düşman türü AYRI ŞEKİL taşır:
 *   spam = elmas (turuncu), trol = boynuzlu kare (pembe), boss = altıgen (kızıl) + can çubuğu.
 * `shadowBlur` kullanılmaz (düşük uçlu Android'de kare düşürüyordu); parıltı yarı saydam
 * katmanlarla. Kozmetik rastgelelik (`Math.random`) skoru ETKİLEMEZ — sim tohumludur.
 */
import { CD_H, CD_W, CORE_R, CORE_X, CORE_Y, type CoreSim, type Enemy, type SimEvent } from './sim';
import { CORE_FX_TEXTS_TR, type CoreFxTexts } from './copy';

export const PALETTE = {
  bg: '#0b1020',
  grid: 'rgba(148,163,184,0.07)',
  core: '#56B4E9',
  coreDim: 'rgba(86,180,233,0.18)',
  hpOk: '#009E73',
  hpLow: '#E69F00',
  hpCrit: '#D55E00',
  spam: '#E69F00',
  troll: '#CC79A7',
  boss: '#D55E00',
  pulse: '#F0E442',
  shot: '#ffffff',
  text: '#f8fafc',
  muted: 'rgba(248,250,252,0.7)',
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
interface Line {
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  color: string;
}
interface Float {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}
interface Ring {
  r: number;
  max: number;
  life: number;
  color: string;
}

export interface FxState {
  particles: Particle[];
  lines: Line[];
  floats: Float[];
  rings: Ring[];
  shake: number;
  coreFlash: number;
  banner: { text: string; sub?: string; life: number } | null;
}

export function createFxState(): FxState {
  return { particles: [], lines: [], floats: [], rings: [], shake: 0, coreFlash: 0, banner: null };
}

const KIND_COLOR = { spam: PALETTE.spam, troll: PALETTE.troll, boss: PALETTE.boss } as const;

/** Sim olaylarını görsel efekte çevirir. `rich=false` (azaltılmış hareket) → parçacık/sarsıntı yok. */
export function applyEventsToFx(
  fx: FxState,
  events: readonly SimEvent[],
  rich: boolean,
  shakeAmp: (px: number) => number,
  texts: CoreFxTexts = CORE_FX_TEXTS_TR
) {
  for (const e of events) {
    switch (e.t) {
      case 'shot':
        fx.lines.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, life: 8, color: PALETTE.shot });
        break;
      case 'chain':
        fx.lines.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, life: 10, color: PALETTE.pulse });
        break;
      case 'kill': {
        if (rich) {
          const n = e.kind === 'boss' ? 26 : e.kind === 'troll' ? 12 : 7;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 0.6 + Math.random() * (e.kind === 'boss' ? 3.4 : 2.2);
            fx.particles.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 26 + Math.random() * 14,
              max: 40,
              color: KIND_COLOR[e.kind],
              size: e.kind === 'boss' ? 3.2 : 2.2,
            });
          }
        }
        fx.floats.push({ x: e.x, y: e.y - 6, text: `+${e.points}`, life: 40, color: e.combo >= 5 ? PALETTE.pulse : PALETTE.text });
        if (e.kind === 'boss') fx.shake = Math.max(fx.shake, shakeAmp(7));
        break;
      }
      case 'miss':
        fx.rings.push({ r: 4, max: 16, life: 14, color: 'rgba(248,250,252,0.5)' });
        fx.floats.push({ x: e.x, y: e.y, text: texts.miss, life: 24, color: PALETTE.muted });
        break;
      case 'core':
        fx.coreFlash = 18;
        fx.shake = Math.max(fx.shake, shakeAmp(e.dmg >= 4 ? 9 : 5));
        break;
      case 'pulse':
        fx.rings.push({ r: CORE_R, max: e.r, life: 24, color: PALETTE.pulse });
        break;
      case 'wave-start':
        fx.banner = { text: e.boss ? texts.bossWave(e.wave) : texts.wave(e.wave), sub: e.boss ? texts.bossSub : undefined, life: 80 };
        break;
      case 'wave-clear':
        fx.banner = { text: e.perfect ? texts.perfect : texts.cleared, sub: texts.bonus(e.bonus), life: 70 };
        break;
      case 'threshold':
        fx.floats.push({ x: CORE_X, y: CORE_Y - 54, text: texts.threshold, life: 90, color: PALETTE.pulse });
        break;
      default:
        break;
    }
  }
}

/** Kozmetik efektleri bir mantık adımı ilerletir (sabit adım → kare hızından bağımsız). */
export function stepFx(fx: FxState) {
  for (const p of fx.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= 1;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  if (fx.particles.length > 260) fx.particles.splice(0, fx.particles.length - 260);
  for (const l of fx.lines) l.life -= 1;
  fx.lines = fx.lines.filter((l) => l.life > 0);
  for (const f of fx.floats) {
    f.y -= 0.5;
    f.life -= 1;
  }
  fx.floats = fx.floats.filter((f) => f.life > 0);
  for (const r of fx.rings) {
    r.life -= 1;
    r.r += (r.max - r.r) * 0.22;
  }
  fx.rings = fx.rings.filter((r) => r.life > 0);
  fx.shake *= 0.85;
  if (fx.shake < 0.2) fx.shake = 0;
  if (fx.coreFlash > 0) fx.coreFlash -= 1;
  if (fx.banner) {
    fx.banner.life -= 1;
    if (fx.banner.life <= 0) fx.banner = null;
  }
}

let gridCache: HTMLCanvasElement | null = null;
function grid(): HTMLCanvasElement | null {
  if (gridCache) return gridCache;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = CD_W;
  c.height = CD_H;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(CORE_X, CORE_Y, 10, CORE_X, CORE_Y, 340);
  grad.addColorStop(0, '#13213f');
  grad.addColorStop(1, PALETTE.bg);
  g.fillStyle = grad;
  g.fillRect(0, 0, CD_W, CD_H);
  g.strokeStyle = PALETTE.grid;
  g.lineWidth = 1;
  for (let x = 0; x <= CD_W; x += 30) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, CD_H);
    g.stroke();
  }
  for (let y = 10; y <= CD_H; y += 30) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(CD_W, y + 0.5);
    g.stroke();
  }
  gridCache = c;
  return c;
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const color = KIND_COLOR[e.kind];
  ctx.save();
  ctx.translate(e.x, e.y);
  // Yumuşak hale (gölge bulanıklığı yerine).
  ctx.fillStyle = color + '33';
  ctx.beginPath();
  ctx.arc(0, 0, e.r + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0b1020';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (e.kind === 'spam') {
    ctx.moveTo(0, -e.r);
    ctx.lineTo(e.r, 0);
    ctx.lineTo(0, e.r);
    ctx.lineTo(-e.r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Zarf işareti.
    ctx.strokeStyle = '#0b1020';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.lineTo(0, 1.5);
    ctx.lineTo(4, -2);
    ctx.stroke();
  } else if (e.kind === 'troll') {
    const s = e.r * 0.85;
    ctx.rect(-s, -s + 2, s * 2, s * 2 - 2);
    ctx.fill();
    ctx.stroke();
    // Boynuzlar.
    ctx.beginPath();
    ctx.moveTo(-s, -s + 2);
    ctx.lineTo(-s - 4, -s - 7);
    ctx.lineTo(-s + 6, -s + 2);
    ctx.moveTo(s, -s + 2);
    ctx.lineTo(s + 4, -s - 7);
    ctx.lineTo(s - 6, -s + 2);
    ctx.fill();
    // Gözler.
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(-6, -3, 4, 4);
    ctx.fillRect(2, -3, 4, 4);
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = Math.cos(a) * e.r;
      const py = Math.sin(a) * e.r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#0b1020';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
  }
  ctx.restore();
  // Can çubuğu (çok canlılarda) — renk + uzunluk (yalnız renge dayanmaz).
  if (e.maxHp > 1) {
    const w = e.r * 2;
    const x = e.x - e.r;
    const y = e.y - e.r - (e.kind === 'troll' ? 13 : 9);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = PALETTE.text;
    ctx.fillRect(x, y, (w * Math.max(0, e.hp)) / e.maxHp, 3);
  }
}

/** Tek kare. `alpha` kullanılmaz (60 Hz mantık, efektler yumuşak). */
export function drawFrame(ctx: CanvasRenderingContext2D, sim: CoreSim, fx: FxState) {
  const sx = fx.shake ? (Math.random() * 2 - 1) * fx.shake : 0;
  const sy = fx.shake ? (Math.random() * 2 - 1) * fx.shake : 0;
  ctx.save();
  ctx.translate(sx, sy);
  const bg = grid();
  if (bg) ctx.drawImage(bg, 0, 0, CD_W, CD_H);
  else {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, CD_W, CD_H);
  }

  // Yavaşlatma alanı.
  if (sim.levels.slow > 0) {
    ctx.fillStyle = 'rgba(86,180,233,0.06)';
    ctx.beginPath();
    ctx.arc(CORE_X, CORE_Y, 110, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kalkan hazırsa menzil çizgisi (kesikli).
  if (sim.charge >= 1 && sim.phase !== 'pick') {
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(240,228,66,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CORE_X, CORE_Y, sim.pulseRadius(), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Çekirdek: can halkası segmentleri (sayı + uzunluk; yalnız renk değil).
  const hpFrac = sim.coreHp / sim.coreMaxHp;
  const hpColor = hpFrac > 0.5 ? PALETTE.hpOk : hpFrac > 0.25 ? PALETTE.hpLow : PALETTE.hpCrit;
  const segs = sim.coreMaxHp;
  const gap = 0.06;
  ctx.lineWidth = 5;
  for (let i = 0; i < segs; i++) {
    const a0 = -Math.PI / 2 + (i / segs) * Math.PI * 2 + gap / 2;
    const a1 = -Math.PI / 2 + ((i + 1) / segs) * Math.PI * 2 - gap / 2;
    ctx.strokeStyle = i < sim.coreHp ? hpColor : 'rgba(148,163,184,0.2)';
    ctx.beginPath();
    ctx.arc(CORE_X, CORE_Y, CORE_R + 8, a0, a1);
    ctx.stroke();
  }
  ctx.fillStyle = fx.coreFlash > 0 && fx.coreFlash % 6 < 3 ? PALETTE.hpCrit : PALETTE.coreDim;
  ctx.beginPath();
  ctx.arc(CORE_X, CORE_Y, CORE_R + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.core;
  ctx.beginPath();
  ctx.arc(CORE_X, CORE_Y, CORE_R - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.bg;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(sim.coreHp), CORE_X, CORE_Y + 1);

  // Atış soğuma halkası.
  if (sim.cooldown > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CORE_X, CORE_Y, CORE_R - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - sim.cooldown / 12));
    ctx.stroke();
  }

  for (const e of sim.enemies) drawEnemy(ctx, e);

  for (const l of fx.lines) {
    ctx.globalAlpha = Math.min(1, l.life / 8);
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.tx, l.ty);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const r of fx.rings) {
    ctx.globalAlpha = Math.max(0, r.life / 24);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CORE_X, CORE_Y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of fx.floats) {
    ctx.globalAlpha = Math.min(1, f.life / 20);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  if (fx.banner) {
    const a = Math.min(1, fx.banner.life / 20);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(11,16,32,0.7)';
    ctx.fillRect(0, 70, CD_W, fx.banner.sub ? 62 : 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(fx.banner.text, CD_W / 2, 92);
    if (fx.banner.sub) {
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText(fx.banner.sub, CD_W / 2, 117);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
