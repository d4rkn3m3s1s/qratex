'use client';

/**
 * Normal rozet paylaşım kartı — offscreen canvas'ta 1080×1350 PNG (karakter rozetleri kendi
 * `character-share-card` akışını kullanır). Renkler QDL token'larından okunur
 * (`--category-*`, `--brand`), okunamazsa güvenli yedek. Harici font/asset yok; rozet görseli
 * aynı kökenden (`/images/badges/*`) ya da R2'den `crossOrigin='anonymous'` ile yüklenir,
 * yüklenemezse baş harfle devam edilir (kart yine üretilir).
 *
 * Akış: dosyalı Web Share (mobil) → indirme (masaüstü) → metin paylaşımı → panoya kopya.
 * Sonuç durum olarak döner; çağıran kullanıcıya dürüst geri bildirim (toast) verir.
 */
import type { CollectionRarity } from '@/lib/badges/collection-logic';

export type ShareOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

export type BadgeShareInput = {
  id: string;
  name: string;
  imageSrc: string | null;
  rarity: CollectionRarity;
  rarityLabel: string;
  holdersPct: number | null;
  color: string | null;
  kicker: string;
  footer: string;
  pctLabel: string | null;
  shareTitle: string;
  shareText: string;
};

const W = 1080;
const H = 1350;
const SITE = 'qratex.com';

const RARITY_TOKEN: Record<CollectionRarity, [string, string, string]> = {
  // [token, yedek kenar, yedek ikinci]
  common: ['--text-3', 'hsl(220 9% 46%)', 'hsl(220 13% 69%)'],
  rare: ['--category-2', 'hsl(217 91% 60%)', 'hsl(199 89% 48%)'],
  epic: ['--category-1', 'hsl(262 83% 58%)', 'hsl(292 84% 61%)'],
  legendary: ['--category-4', 'hsl(38 92% 50%)', 'hsl(48 96% 53%)'],
};

function tokenColor(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? `hsl(${v})` : fallback;
  } catch {
    return fallback;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const done = (v: HTMLImageElement | null) => {
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 6000);
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export async function renderBadgeShareImage(input: BadgeShareInput): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const [tok, fb1, fb2] = RARITY_TOKEN[input.rarity];
  const edge = input.color || tokenColor(tok, fb1);
  const edge2 = input.color ? tokenColor('--brand', fb2) : fb2;
  const brand = tokenColor('--brand', 'hsl(262 83% 58%)');

  // Zemin: koyu, sakin; rozet kimlik renginden tek hale.
  ctx.fillStyle = '#0b0a12';
  ctx.fillRect(0, 0, W, H);
  const halo = ctx.createRadialGradient(W / 2, 560, 40, W / 2, 560, 640);
  halo.addColorStop(0, edge);
  halo.addColorStop(1, 'rgba(11,10,18,0)');
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Üst: marka + kicker
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 56px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('QRateX', W / 2, 120);
  ctx.fillStyle = edge;
  ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(input.kicker, W / 2, 180);

  // Madalyon: gradient halka + beyaz iç disk + görsel
  const cx = W / 2;
  const cy = 560;
  const r = 260;
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, edge);
  ring.addColorStop(1, edge2);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 18, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const img = input.imageSrc ? await loadImage(input.imageSrc) : null;
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 30, 0, Math.PI * 2);
    ctx.clip();
    const size = (r - 30) * 2;
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = '#1f1b2e';
    ctx.font = '800 200px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(input.name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?', cx, cy + 10);
  }

  // Ad
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 76px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const lines = wrapLines(ctx, input.name, W - 160, 2);
  let y = 920;
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += 86;
  }

  // Nadirlik çipi
  ctx.font = '700 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const label = input.rarityLabel.toLocaleUpperCase('tr-TR');
  const tw = ctx.measureText(label).width + 64;
  const chipY = y + 10;
  ctx.fillStyle = edge;
  ctx.beginPath();
  const rx = W / 2 - tw / 2;
  const rh = 64;
  const rr = 32;
  ctx.moveTo(rx + rr, chipY);
  ctx.arcTo(rx + tw, chipY, rx + tw, chipY + rh, rr);
  ctx.arcTo(rx + tw, chipY + rh, rx, chipY + rh, rr);
  ctx.arcTo(rx, chipY + rh, rx, chipY, rr);
  ctx.arcTo(rx, chipY, rx + tw, chipY, rr);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b0a12';
  ctx.fillText(label, W / 2, chipY + rh / 2 + 2);

  if (input.pctLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '500 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(input.pctLabel, W / 2, chipY + rh + 60);
  }

  // Alt: davet + site
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 36px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(input.footer, W / 2, H - 120);
  ctx.fillStyle = brand;
  ctx.font = '800 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`→  ${SITE}`, W / 2, H - 66);

  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null); // kirlenmiş tuval (CORS) → metin paylaşımına düşülür
    }
  });
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function shareBadge(input: BadgeShareInput): Promise<ShareOutcome> {
  const text = `${input.shareText} → ${SITE}`;
  let blob: Blob | null = null;
  try {
    blob = await renderBadgeShareImage(input);
  } catch {
    blob = null;
  }

  if (blob) {
    const file = new File([blob], `qratex-rozet-${input.id}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: input.shareTitle, text });
        return 'shared';
      } catch (err) {
        if (isAbort(err)) return 'cancelled';
      }
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return 'downloaded';
    } catch {
      /* metne düş */
    }
  }

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: input.shareTitle, text });
      return 'shared';
    } catch (err) {
      if (isAbort(err)) return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
