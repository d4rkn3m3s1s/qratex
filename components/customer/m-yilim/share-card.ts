'use client';

/**
 * Yılım paylaşım kartı: 1080×1920 (9:16, hikâye formatı) PNG, offscreen canvas'ta çizilir.
 *
 *  - Yalnız GERÇEK özet değerleri yazılır; sıfır olan metrik karta girmez.
 *  - Kişisel veri yok: ad, e-posta, yorum metni ya da bayi yanıtı karta yazılmaz.
 *  - Harici görsel/font yüklenmez (canvas "taint" olmaz); renkler QDL token'larından okunur.
 *  - Paylaşım: Web Share API (dosya ile). Tarayıcı dosya paylaşımını desteklemiyorsa
 *    (çoğu masaüstü) dürüstçe "Kartı kaydet" olarak cihaza kaydedilir.
 */
import type { YearSummary } from '@/lib/customer-year/contract';
import { categoryColor, hsla, readHslToken, type Hsl } from './color-tokens';
import type { YearCopy } from './copy';

export const CARD_W = 1080;
export const CARD_H = 1920;

export type ShareCardStat = { value: string; label: string };
export type ShareCardData = {
  periodLabel: string;
  stats: ShareCardStat[];
  rows: Array<{ label: string; value: string }>;
};

/** Özet → kart içeriği (saf). Değeri olmayan metrik atlanır, en fazla 4 sayı + 3 satır. */
export function buildShareCardData(s: YearSummary, copy: YearCopy): ShareCardData {
  const c = copy.share.card;
  const stats: ShareCardStat[] = [];
  if (s.visits.total > 0) stats.push({ value: copy.fmt(s.visits.total), label: c.visits });
  if (s.reviews.total > 0) stats.push({ value: copy.fmt(s.reviews.total), label: c.reviews });
  if (s.reviews.mostGiven != null) stats.push({ value: `${s.reviews.mostGiven}★`, label: c.mostGiven });
  if (s.badges.total > 0) stats.push({ value: copy.fmt(s.badges.total), label: c.badges });

  const rows: ShareCardData['rows'] = [];
  if (s.favorites[0]) rows.push({ label: c.favorite, value: s.favorites[0].name });
  const league = s.journey.peakLeague ?? s.journey.endLeague;
  if (league) rows.push({ label: c.league, value: league.name });
  if (s.rhythm.peak && s.visits.activeDays >= 2) rows.push({ label: c.persona, value: copy.archetype[s.rhythm.peak].name });

  return { periodLabel: copy.periodLabel(s.period.year, s.period.month), stats: stats.slice(0, 4), rows: rows.slice(0, 3) };
}

function fontStack(kind: 'display' | 'sans'): string {
  if (typeof document === 'undefined') return 'system-ui, sans-serif';
  try {
    const root = getComputedStyle(document.documentElement);
    const display = root.getPropertyValue('--font-display').trim() || root.getPropertyValue('--font-mono').trim();
    const sans = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    return kind === 'display' && display ? `${display}, ${sans}` : sans;
  } catch {
    return 'system-ui, sans-serif';
  }
}

/** Metni genişliğe sığdır: önce yazı boyunu küçült (min'e kadar), sonra üç noktayla kes. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, min: number, weight: number, family: string): number {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
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

/** Kartı verilen canvas bağlamına çizer (test/önizleme için ayrı). */
export function drawYearCard(ctx: CanvasRenderingContext2D, data: ShareCardData, copy: YearCopy, palette?: { brand: Hsl; a: Hsl; b: Hsl; c: Hsl }) {
  const brand = palette?.brand ?? readHslToken('brand');
  const a = palette?.a ?? categoryColor(2);
  const b = palette?.b ?? categoryColor(8);
  const c = palette?.c ?? categoryColor(4);
  const display = fontStack('display');
  const sans = fontStack('sans');
  const W = CARD_W;
  const H = CARD_H;
  const M = 96;

  // Zemin: koyu marka gradyanı (her temada aynı okunurluk; beyaz metin ≥ 7:1).
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, hsla(brand, 1, 14));
  bg.addColorStop(1, hsla({ ...brand, h: brand.h + 36 }, 1, 7));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Yumuşak ışık lekeleri (sabit konum; rastgelelik yok).
  const blob = (x: number, y: number, r: number, col: Hsl, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hsla(col, alpha, 58));
    g.addColorStop(1, hsla(col, 0, 58));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  blob(W * 0.85, H * 0.12, 620, a, 0.42);
  blob(W * 0.08, H * 0.48, 560, b, 0.32);
  blob(W * 0.7, H * 0.92, 700, c, 0.3);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `600 34px ${sans}`;
  ctx.fillText(copy.share.card.overline, M, 190);

  // Dönem: dev başlık.
  ctx.fillStyle = '#ffffff';
  const px = fitText(ctx, data.periodLabel, W - M * 2, 230, 120, 800, display);
  ctx.fillText(data.periodLabel, M, 190 + px * 0.95);
  let y = 190 + px * 0.95 + 40;

  // İnce marka çizgisi.
  const line = ctx.createLinearGradient(M, 0, W - M, 0);
  line.addColorStop(0, hsla(a, 0.95, 66));
  line.addColorStop(1, hsla(b, 0.95, 70));
  ctx.fillStyle = line;
  roundRect(ctx, M, y, 220, 10, 5);
  ctx.fill();
  y += 96;

  // Sayı ızgarası (2 sütun).
  const colW = (W - M * 2 - 40) / 2;
  data.stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (colW + 40);
    const top = y + row * 300;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, top, colW, 260, 36);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    fitText(ctx, s.value, colW - 72, 120, 64, 800, display);
    ctx.fillText(s.value, x + 36, top + 150);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    fitText(ctx, s.label, colW - 72, 36, 26, 500, sans);
    ctx.fillText(ellipsize(ctx, s.label, colW - 72), x + 36, top + 214);
  });
  y += Math.ceil(data.stats.length / 2) * 300 + (data.stats.length ? 40 : 0);

  // Anlatı satırları.
  for (const r of data.rows) {
    if (y > H - 300) break;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `600 32px ${sans}`;
    ctx.fillText(r.label.toLocaleUpperCase(copy.locale === 'en' ? 'en-US' : 'tr-TR'), M, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 64px ${display}`;
    ctx.fillText(ellipsize(ctx, r.value, W - M * 2), M, y + 78);
    y += 170;
  }

  // Alt bilgi.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 40px ${sans}`;
  ctx.fillText(copy.share.card.footer, M, H - 120);
}

export async function renderYearCard(data: ShareCardData, copy: YearCopy): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* font beklenemezse sistem fontuyla devam */
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  drawYearCard(ctx, data, copy);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png-failed'))), 'image/png');
  });
}

/** Tarayıcı dosya paylaşımını destekliyor mu? (Web Share Level 2) */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof File === 'undefined') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

/** PNG'yi Web Share ile paylaşır; dosya paylaşımı yoksa cihaza kaydeder. */
export async function shareYearCard(blob: Blob, fileName: string, title: string, text: string): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  return 'downloaded';
}
