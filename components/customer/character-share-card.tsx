'use client';

/**
 * KARAKTER ROZETİ — PAYLAŞILABİLİR GÖRSEL KART
 *
 * Kullanıcı kazandığı karakteri sosyal medyada METİN değil, şık bir PNG görsel
 * olarak paylaşabilsin diye offscreen bir canvas'a sinematik bir "paylaşım kartı"
 * çizer ve PNG blob üretir.
 *
 *  • `generateCharacterShareImage(character)` → offscreen canvas'a çizer, PNG Blob döndürür.
 *  • `shareCharacter(character)` → blob'u üretip navigator.share (mobil) ile PNG paylaşır;
 *     desteklenmiyorsa dosyayı indirir; her şey başarısızsa metin paylaşımına düşer.
 *
 * Harici asset/font YOKTUR — tamamen prosedürel canvas 2D + sistem (bold sans-serif) fontu.
 * R2 görselleri crossOrigin='anonymous' ile yüklenir (canvas taint olmasın, toBlob çalışsın);
 * görsel yüklenmezse kategori emojisiyle devam edilir (kart yine üretilir).
 */

// ── Paylaşılacak karakterin tipi (character-reveal'deki RevealCharacter ile uyumlu) ──
export type ShareCharacterCategory = {
  key: string;
  name: string;
  emoji: string;
  accent: string;
  description?: string;
};

export type ShareCharacter = {
  badgeId: string;
  name: string;
  why?: string;
  icon?: string;
  description?: string;
  category?: ShareCharacterCategory | null;
  rarity?: string;
  holders?: number;
  ratePct?: number | null;
} | null;

// ── Sabitler ──────────────────────────────────────────────────────────
/** Kart boyutu — dikey (portre), sosyal medya paylaşımına uygun. */
const CARD_W = 1080;
const CARD_H = 1350;
/** Kategori gelene kadar / yoksa güvenli mor accent. */
const DEFAULT_ACCENT = '#9333ea';
/** Site / marka etiketleri. */
const SITE_LABEL = 'qratex.com';

// ── Rarity teması (reveal ekranıyla renk uyumlu) ─────────────────────
type ShareRarity = {
  label: string | null; // rozet metni (common'da yok)
  glow: string; // rarity ışık rengi (hex)
  glow2: string; // ikincil ton
};
const RARITY: Record<string, ShareRarity> = {
  legendary: { label: 'EFSANEVİ', glow: '#f59e0b', glow2: '#fde047' },
  epic: { label: 'EPİK', glow: '#c026d3', glow2: '#a855f7' },
  rare: { label: 'NADİR', glow: '#3b82f6', glow2: '#60a5fa' },
  common: { label: null, glow: '#94a3b8', glow2: '#cbd5e1' },
};
function rarityOf(rarity?: string): ShareRarity {
  return RARITY[(rarity || '').toLowerCase()] ?? RARITY.common;
}

// ── Yardımcı: hex → rgba (canvas glow'ları için) ─────────────────────
function rgba(hex: string, alpha: number): string {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(147,51,234,${alpha})`; // güvenli mor fallback
  return `rgba(${r},${g},${b},${alpha})`;
}

/** hex → {r,g,b} (renk karıştırma için). */
function toRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return { r: 147, g: 51, b: 234 };
  return { r, g, b };
}

/** İki rengi karıştır (koyu sinematik zemin için accent'i karartmak amacıyla). */
function mix(hexA: string, hexB: string, t: number): string {
  const a = toRgb(hexA);
  const b = toRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Görseli crossOrigin='anonymous' ile yükler (canvas taint olmasın).
 * Başarısız/zaman aşımı olursa null döner — çağıran emoji fallback ile devam eder.
 */
function loadImageSafe(src: string, timeoutMs = 6000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let settled = false;
      const done = (val: HTMLImageElement | null) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      img.onload = () => {
        clearTimeout(timer);
        done(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      img.src = src;
      // Zaten önbellekteyse onload tetiklenmeyebilir — decode ile garantiye al.
      if (img.complete && img.naturalWidth > 0) {
        clearTimeout(timer);
        done(img);
      }
    } catch {
      resolve(null);
    }
  });
}

/** Yüzde etiketini okunur biçimle (çok küçükse ondalık). */
function rateLabel(ratePct?: number | null): string | null {
  if (typeof ratePct !== 'number' || !Number.isFinite(ratePct)) return null;
  return ratePct < 1 ? ratePct.toFixed(1) : String(Math.round(ratePct));
}

/** Metni verilen genişliğe sığana kadar font boyutunu küçültür (taşmayı önler). */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
  weight = '800',
): number {
  let size = startPx;
  while (size > minPx) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

/** Uzun metni birden fazla satıra böler (kelime sarma). En fazla `maxLines` satır. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Kalan varsa son satıra "…" ekle.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    // Sığmayan kelime kaldıysa üç nokta ekle.
    const joined = lines.join(' ');
    if (joined.length < text.length) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** Yuvarlatılmış dikdörtgen yolu (rozet/etiket zeminleri için). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Sistem sans-serif yığını (harici font gerektirmez; emoji desteği için Segoe/Apple/Noto). */
const FONT_STACK =
  '"Segoe UI", "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// ─────────────────────────────────────────────────────────────────────
// ANA ÜRETİCİ — offscreen canvas'a şık kart çizer, PNG blob döndürür
// ─────────────────────────────────────────────────────────────────────
export async function generateCharacterShareImage(
  character: ShareCharacter,
): Promise<Blob | null> {
  if (typeof document === 'undefined' || !character) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const accent = character.category?.accent || DEFAULT_ACCENT;
    const rar = rarityOf(character.rarity);
    // Rozet renginin ana glow'u: rarity varsa rarity, yoksa accent.
    const glow = rar.label ? rar.glow : accent;
    const glow2 = rar.label ? rar.glow2 : accent;

    // Görseli önden yükle (varsa) — crossOrigin ile; yüklenmezse emoji fallback.
    const iconImg = character.icon ? await loadImageSafe(character.icon) : null;

    const cx = CARD_W / 2;

    // ── 1) ARKA PLAN — koyu sinematik dikey gradient (accent'ten türetilmiş) ──
    const top = mix(accent, '#05060d', 0.72); // accent'in koyulaştırılmış tonu
    const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
    bg.addColorStop(0, top);
    bg.addColorStop(0.5, '#080a14');
    bg.addColorStop(1, '#04050b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // Üstten accent renkli radyal ışıma (sahne aydınlatması).
    const halo = ctx.createRadialGradient(cx, CARD_H * 0.34, 40, cx, CARD_H * 0.34, CARD_W * 0.9);
    halo.addColorStop(0, rgba(glow, 0.28));
    halo.addColorStop(0.4, rgba(accent, 0.14));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // ── 2) PARÇACIK / IŞILTI — deterministik dağılım (her çağrıda aynı, şık) ──
    drawParticles(ctx, glow, glow2);

    // İnce çerçeve (kartın kenarına zarif ışık hattı).
    ctx.save();
    roundRectPath(ctx, 24, 24, CARD_W - 48, CARD_H - 48, 44);
    ctx.strokeStyle = rgba(glow, 0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // ── 3) ÜST: MARKA + "KARAKTER ROZETİ" etiketi ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // QRateX marka (harf aralıklı, parlak).
    ctx.save();
    ctx.font = `800 46px ${FONT_STACK}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = rgba(glow, 0.6);
    ctx.shadowBlur = 24;
    drawSpaced(ctx, 'QRateX', cx, 116, 6);
    ctx.restore();

    // "KARAKTER ROZETİ" alt etiket — accent renkli, harf aralıklı.
    ctx.save();
    ctx.font = `700 24px ${FONT_STACK}`;
    ctx.fillStyle = rgba('#ffffff', 0.72);
    drawSpaced(ctx, 'KARAKTER ROZETİ', cx, 156, 8);
    ctx.restore();

    // ── 4) ORTA: büyük karakter madalyonu (ikon veya emoji) ──
    const medY = 470; // madalyon merkezi (dikey)
    const medR = 210; // madalyon yarıçapı

    // Dış glow halkası (rarity conic hissini radyal katmanlarla verir).
    const outer = ctx.createRadialGradient(cx, medY, medR * 0.6, cx, medY, medR * 1.5);
    outer.addColorStop(0, rgba(glow, 0.5));
    outer.addColorStop(0.6, rgba(glow2, 0.22));
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(cx, medY, medR * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Renkli çelenk halkası.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, medY, medR + 14, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = rgba(glow, 0.85);
    ctx.shadowColor = rgba(glow, 0.8);
    ctx.shadowBlur = 40;
    ctx.stroke();
    ctx.restore();

    // Madalyon gövdesi (açık merkez → accent kenar).
    const body = ctx.createRadialGradient(
      cx - medR * 0.3,
      medY - medR * 0.35,
      medR * 0.15,
      cx,
      medY,
      medR,
    );
    body.addColorStop(0, rgba('#ffffff', 0.95));
    body.addColorStop(0.55, rgba(glow, 0.4));
    body.addColorStop(1, mix(accent, '#0b1020', 0.55));
    ctx.beginPath();
    ctx.arc(cx, medY, medR, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // İçeriği madalyona kırp (ikon/emoji taşmasın).
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, medY, medR - 6, 0, Math.PI * 2);
    ctx.clip();
    if (iconImg && iconImg.naturalWidth > 0) {
      // Görseli oranını koruyarak madalyona sığdır (contain).
      const target = medR * 1.5; // görsel kutu kenarı
      const scale = Math.min(target / iconImg.naturalWidth, target / iconImg.naturalHeight);
      const dw = iconImg.naturalWidth * scale;
      const dh = iconImg.naturalHeight * scale;
      ctx.drawImage(iconImg, cx - dw / 2, medY - dh / 2, dw, dh);
    } else {
      // Emoji fallback — kategori emojisi (yoksa 🎭).
      const emoji = character.category?.emoji || '🎭';
      ctx.font = `${Math.round(medR * 1.15)}px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, cx, medY + medR * 0.06);
    }
    ctx.restore();

    // Cam highlight (üst-sol).
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx - medR * 0.32, medY - medR * 0.42, medR * 0.34, medR * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = rgba('#ffffff', 0.4);
    ctx.fill();
    ctx.restore();

    // ── 5) RARITY rozeti (madalyonun hemen altında, ortalı pill) ──
    let cursorY = medY + medR + 82;
    if (rar.label) {
      ctx.font = `800 30px ${FONT_STACK}`;
      const labelText = rar.label;
      const padX = 34;
      const tw = ctx.measureText(labelText).width + padX * 2;
      const th = 62;
      const bx = cx - tw / 2;
      const by = cursorY - th + 14;
      // Pill zemini.
      ctx.save();
      roundRectPath(ctx, bx, by, tw, th, th / 2);
      const pill = ctx.createLinearGradient(bx, by, bx + tw, by);
      pill.addColorStop(0, rgba(glow, 0.28));
      pill.addColorStop(1, rgba(glow2, 0.18));
      ctx.fillStyle = pill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(glow, 0.7);
      ctx.stroke();
      ctx.restore();
      // Pill metni.
      ctx.save();
      ctx.fillStyle = glow2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = rgba(glow, 0.7);
      ctx.shadowBlur = 16;
      drawSpaced(ctx, labelText, cx, by + th / 2 + 1, 3, 'middle');
      ctx.restore();
      cursorY += 78;
    } else {
      cursorY += 6;
    }

    // ── 6) KARAKTER ADI (büyük, şık, taşmaya karşı otomatik küçülür) ──
    const name = character.name || 'Karakter';
    const maxTextW = CARD_W - 160;
    const nameSize = fitFontSize(ctx, name, maxTextW, 88, 48, '800');
    ctx.font = `800 ${nameSize}px ${FONT_STACK}`;
    // İki satıra kadar sar (çok uzun adlar için).
    const nameLines = wrapLines(ctx, name, maxTextW, 2);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = rgba(glow, 0.55);
    ctx.shadowBlur = 30;
    const nameLineH = nameSize * 1.05;
    for (let i = 0; i < nameLines.length; i++) {
      ctx.fillText(nameLines[i], cx, cursorY + i * nameLineH);
    }
    ctx.restore();
    cursorY += (nameLines.length - 1) * nameLineH + 58;

    // ── 7) KATEGORİ etiketi (emoji + ad, accent renkli) ──
    if (character.category) {
      const cat = character.category;
      const catText = `${cat.emoji}  ${cat.name}`;
      ctx.font = `700 38px ${FONT_STACK}`;
      const twc = ctx.measureText(catText).width;
      const padX = 30;
      const bw = Math.min(twc + padX * 2, CARD_W - 120);
      const bh = 66;
      const bx = cx - bw / 2;
      const by = cursorY - bh + 20;
      ctx.save();
      roundRectPath(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = rgba(cat.accent, 0.16);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(cat.accent, 0.5);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Emoji'yi beyaz bırak, kategori adını accent tonuna yakın parlak beyaz tut.
      ctx.fillText(catText, cx, by + bh / 2 + 2);
      ctx.restore();
      cursorY += 92;
    }

    // ── 8) NADİR ORAN göstergesi (ratePct varsa) ──
    const rl = rateLabel(character.ratePct);
    if (rl !== null) {
      const veryRare = (character.ratePct as number) <= 5;
      const rareText = veryRare
        ? `🏆  Oyuncuların yalnızca %${rl}'inde — çok nadir!`
        : `🏆  Oyuncuların %${rl}'inde`;
      ctx.font = `700 30px ${FONT_STACK}`;
      const trw = ctx.measureText(rareText).width;
      const rareCol = veryRare ? glow : '#facc15';
      ctx.save();
      ctx.fillStyle = rgba(rareCol, 0.95);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Taşarsa küçült.
      let rs = 30;
      while (trw > CARD_W - 140 && rs > 20) {
        rs -= 2;
        ctx.font = `700 ${rs}px ${FONT_STACK}`;
      }
      ctx.fillText(rareText, cx, cursorY);
      ctx.restore();
      cursorY += 70;
    }

    // ── 9) ALT: CTA + site ──
    // Zarif ayraç çizgisi.
    ctx.save();
    const lineY = CARD_H - 190;
    const lg = ctx.createLinearGradient(cx - 220, lineY, cx + 220, lineY);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, rgba(glow, 0.5));
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 220, lineY);
    ctx.lineTo(cx + 220, lineY);
    ctx.stroke();
    ctx.restore();

    // CTA metni.
    ctx.save();
    ctx.font = `700 40px ${FONT_STACK}`;
    ctx.fillStyle = rgba('#ffffff', 0.92);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Sen de karakterini keşfet', cx, CARD_H - 120);
    ctx.restore();

    // Site etiketi (accent parıltılı).
    ctx.save();
    ctx.font = `800 34px ${FONT_STACK}`;
    ctx.fillStyle = glow2;
    ctx.textAlign = 'center';
    ctx.shadowColor = rgba(glow, 0.7);
    ctx.shadowBlur = 20;
    ctx.fillText(`→  ${SITE_LABEL}`, cx, CARD_H - 68);
    ctx.restore();

    // ── PNG blob üret ──
    return await canvasToBlob(canvas);
  } catch {
    // Herhangi bir çizim/taint hatası — sessizce null (çağıran metne düşer).
    return null;
  }
}

/** Harf aralıklı (letter-spacing) metin çizimi — canvas'ta yerleşik olmadığı için elle. */
function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  spacing: number,
  baseline: CanvasTextBaseline = 'alphabetic',
): void {
  const chars = Array.from(text);
  // Toplam genişliği hesapla (ortalamak için).
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  const prevAlign = ctx.textAlign;
  const prevBaseline = ctx.textBaseline;
  ctx.textAlign = 'left';
  ctx.textBaseline = baseline;
  let x = centerX - total / 2;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBaseline;
}

/** Deterministik parçacık/ışıltı serpme (koyu zemine hafif derinlik). */
function drawParticles(ctx: CanvasRenderingContext2D, glow: string, glow2: string): void {
  // Basit LCG — her çağrıda aynı, şık dağılım (rastgelelik hissi ama kararlı).
  let seed = 987654321;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const x = rand() * CARD_W;
    const y = rand() * CARD_H;
    const r = rand() * 2.6 + 0.5;
    const a = rand() * 0.5 + 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = rand() > 0.5 ? rgba('#ffffff', a) : rgba(rand() > 0.5 ? glow : glow2, a);
    ctx.fill();
  }
  // Birkaç büyük yumuşak ışık lekesi.
  for (let i = 0; i < 5; i++) {
    const x = rand() * CARD_W;
    const y = rand() * CARD_H;
    const rad = rand() * 120 + 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(rand() > 0.5 ? glow : glow2, 0.14));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

/** canvas.toBlob'u Promise'a sarar (PNG). */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// PAYLAŞ — blob üret, sonra native paylaş / indir / (son çare) metin
// ─────────────────────────────────────────────────────────────────────
export async function shareCharacter(character: ShareCharacter): Promise<void> {
  if (!character) return;

  const title = `QRateX karakterim: ${character.name}!`;
  const rar = rarityOf(character.rarity);
  const rarPrefix = rar.label ? `${rar.label} ` : '';
  const text = `QRateX'te ${rarPrefix}karakter rozetimi kazandım: ${character.name} 🎭 → ${SITE_LABEL}`;

  let blob: Blob | null = null;
  try {
    blob = await generateCharacterShareImage(character);
  } catch {
    blob = null;
  }

  // 1) PNG dosyasıyla native paylaşım (mobil / destekli tarayıcı).
  if (blob) {
    try {
      const file = new File([blob], 'qratex-karakter.png', { type: 'image/png' });
      const navAny = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navAny.canShare === 'function' &&
        navAny.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title, text });
        return;
      }
    } catch {
      // Kullanıcı iptal etti ya da dosya paylaşımı başarısız — indirmeye düş.
    }

    // 2) Blob'u indir (masaüstü / dosya paylaşımı yoksa).
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qratex-karakter.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // URL'i biraz sonra serbest bırak (indirme başlasın).
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* zaten serbest — sorun değil */
        }
      }, 4000);
      return;
    } catch {
      // İndirme de başarısız — metin paylaşımına düş.
    }
  }

  // 3) SON ÇARE: metin paylaşımı (görsel üretilemedi/indirilemedi).
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return;
    }
  } catch {
    // Kullanıcı iptal etti — panoya düş.
  }
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* pano da yoksa sessizce geç — hata akışı bozulmasın */
  }
}
