/**
 * Baskı şablonları — SAF yerleşim motoru (sunucu + istemci aynı kodu çalıştırır → WYSIWYG).
 *
 * Şablon → milimetre cinsinden ilkel listesi (`PrintPage`) → SVG (`renderSvg`) ya da PDF
 * (`./pdf.ts`). Önizleme, indirilen SVG/PNG ve PDF aynı yerleşimden çıkar; eskiden "çerçeve"
 * yalnız önizlemedeki <img>'e CSS kenarlığıydı ve indirilen dosyaya hiç yansımıyordu (rapor #46).
 *
 * Yazı ölçümü Helvetica/Helvetica-Bold AFM genişlikleriyle yapılır (PDF'in standart fontu; SVG'de
 * Helvetica/Arial, metrikleri neredeyse aynı) → uzun işletme adları iki çıktıda da aynı ölçüde küçülür.
 */
import { DEFAULT_CTA, type PrintStyle, type PrintTemplate } from './rules';

export interface QrMatrix {
  size: number;
  rows: boolean[][];
}

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'qr'; x: number; y: number; size: number; matrix: QrMatrix; color: string; quiet: number }
  | { t: 'text'; x: number; y: number; text: string; size: number; bold: boolean; color: string; anchor: 'start' | 'middle' }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash: boolean }
  | { t: 'rotate180'; cx: number; cy: number; children: Prim[] };

export interface PrintPage {
  width: number;
  height: number;
  title: string;
  prims: Prim[];
}

export interface PrintInput {
  template: PrintTemplate;
  matrix: QrMatrix;
  businessName: string;
  /** QR'ın adı ("Masa 4"); işletme adıyla aynıysa null. */
  spotName: string | null;
  code: string;
  /** Kısa ana makine adı (ör. "qratex.com") — kod elle girilecekse nereye. */
  host: string;
  style: PrintStyle;
}

// ───────────────────────────── Yazı metrikleri ─────────────────────────────

/* prettier-ignore */
const HELV: number[] = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278, // 32-47
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556, // 48-63
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778, // 64-79
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556, // 80-95
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556, // 96-111
  556,556,333,500,278,556,500,722,500,500,500,334,260,334,584, // 112-126
];
/* prettier-ignore */
const HELV_BOLD: number[] = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
  611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
];
const EXTRA: Record<string, [number, number]> = {
  Ç: [722, 722], ç: [500, 556], Ö: [778, 778], ö: [556, 611], Ü: [722, 722], ü: [556, 611],
  Ş: [667, 667], ş: [500, 556], Ğ: [778, 778], ğ: [556, 611], İ: [278, 278], ı: [278, 278],
  â: [556, 556], Â: [667, 722], î: [278, 278], û: [556, 611], é: [556, 556], '·': [278, 278],
};

function charWidth(ch: string, bold: boolean): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return (bold ? HELV_BOLD : HELV)[code - 32];
  const e = EXTRA[ch];
  if (e) return bold ? e[1] : e[0];
  return bold ? 611 : 556;
}

/** Yazı genişliği (mm). `size` = yazı boyu (mm). */
export function textWidth(text: string, size: number, bold: boolean): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, bold);
  return (w / 1000) * size;
}

/** Yazıyı `maxWidth`'e sığdır: önce küçült, en küçük boyda da sığmazsa sonunu "..." ile kes. */
export function fitText(text: string, maxWidth: number, size: number, minSize: number, bold: boolean): { text: string; size: number } {
  const clean = text.replace(/\s+/g, ' ').trim();
  let s = size;
  while (s > minSize && textWidth(clean, s, bold) > maxWidth) s = Math.max(minSize, +(s - 0.25).toFixed(2));
  if (textWidth(clean, s, bold) <= maxWidth) return { text: clean, size: s };
  const chars = Array.from(clean);
  while (chars.length > 1 && textWidth(`${chars.join('')}...`, s, bold) > maxWidth) chars.pop();
  return { text: `${chars.join('').trimEnd()}...`, size: s };
}

// ───────────────────────────── Renk ─────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** `a` rengini `t` oranında `b`'ye karıştır. */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`.toUpperCase();
}

// ───────────────────────────── Şablonlar ─────────────────────────────

const QUIET = 4; // QR standardı: 4 modül sessiz alan

function centered(text: string, cx: number, baseline: number, maxW: number, size: number, min: number, bold: boolean, color: string): Prim {
  const f = fitText(text, maxW, size, min, bold);
  return { t: 'text', x: cx, y: baseline, text: f.text, size: f.size, bold, color, anchor: 'middle' };
}

function footerLine(input: PrintInput): string {
  return `${input.host} · Kod: ${input.code}`;
}

function cardFace(input: PrintInput, w: number, h: number): Prim[] {
  const { fg, bg } = input.style;
  const muted = mixHex(fg, bg, 0.28);
  const cta = input.style.cta.trim() || DEFAULT_CTA;
  const cx = w / 2;
  const qr = 66;
  const prims: Prim[] = [
    { t: 'rect', x: 0, y: 0, w, h, fill: bg },
    { t: 'rect', x: 0, y: 0, w, h: 27, fill: fg },
    centered(input.businessName, cx, 15.5, w - 14, 7, 4, true, bg),
    centered('Görüşünüz bizim için değerli', cx, 22.5, w - 14, 3.4, 2.6, false, bg),
    centered(cta, cx, 39, w - 12, 6, 3.6, true, fg),
    { t: 'qr', x: (w - qr) / 2, y: 44, size: qr, matrix: input.matrix, color: fg, quiet: QUIET },
    centered('Telefonunuzun kamerasıyla okutun', cx, 117, w - 14, 3.6, 2.6, false, muted),
  ];
  if (input.spotName) prims.push(centered(input.spotName, cx, 128, w - 14, 5.2, 3, true, fg));
  prims.push(centered(footerLine(input), cx, h - 6, w - 14, 2.8, 2.2, false, muted));
  return prims;
}

function tentFace(input: PrintInput, w: number, h: number): Prim[] {
  const { fg, bg } = input.style;
  const muted = mixHex(fg, bg, 0.28);
  const cta = input.style.cta.trim() || DEFAULT_CTA;
  const qr = 84;
  const qrX = 16;
  const qrY = (h - qr) / 2;
  const colX = qrX + qr + 10;
  const colW = w - colX - 12;
  const cx = colX + colW / 2;
  const prims: Prim[] = [
    { t: 'rect', x: 0, y: 0, w, h, fill: bg },
    { t: 'rect', x: 0, y: 0, w: 5, h, fill: fg },
    { t: 'qr', x: qrX, y: qrY, size: qr, matrix: input.matrix, color: fg, quiet: QUIET },
    centered(input.businessName, cx, 42, colW, 8, 4, true, fg),
    { t: 'line', x1: cx - 16, y1: 50, x2: cx + 16, y2: 50, color: fg, width: 0.6, dash: false },
    centered(cta, cx, 66, colW, 6.4, 3.6, true, fg),
    centered('Telefonunuzun kamerasıyla okutun', cx, 76, colW, 3.8, 2.6, false, muted),
  ];
  if (input.spotName) prims.push(centered(input.spotName, cx, 98, colW, 6, 3, true, fg));
  prims.push(centered(footerLine(input), cx, h - 12, colW, 3, 2.2, false, muted));
  return prims;
}

function stickerFace(input: PrintInput, w: number, h: number): Prim[] {
  const { fg, bg } = input.style;
  const cta = input.style.cta.trim() || DEFAULT_CTA;
  const qr = 60;
  return [
    { t: 'rect', x: 0, y: 0, w, h, fill: bg },
    { t: 'rect', x: 0, y: 0, w, h: 1.6, fill: fg },
    { t: 'rect', x: 0, y: h - 1.6, w, h: 1.6, fill: fg },
    centered(input.businessName, w / 2, 11, w - 10, 5, 3, true, fg),
    { t: 'qr', x: (w - qr) / 2, y: 14, size: qr, matrix: input.matrix, color: fg, quiet: QUIET },
    centered(cta, w / 2, 81, w - 10, 4.6, 2.8, true, fg),
  ];
}

/** Şablon → sayfa. Boyutlar mm. */
export function buildPrintPage(input: PrintInput): PrintPage {
  const title = input.spotName ? `${input.businessName} · ${input.spotName}` : input.businessName;
  switch (input.template) {
    case 'card': {
      const w = 105;
      const h = 148;
      return { width: w, height: h, title, prims: cardFace(input, w, h) };
    }
    case 'tent': {
      // A4 dikey; ortadan katlanır. Üst yarı 180° döndürülür → katlayınca iki yüz de okunur.
      const w = 210;
      const h = 297;
      const half = h / 2;
      const face = tentFace(input, w, half);
      const shift = (p: Prim): Prim => shiftPrim(p, half);
      return {
        width: w,
        height: h,
        title,
        prims: [
          ...face.map(shift),
          { t: 'rotate180', cx: w / 2, cy: h / 2, children: face.map(shift) },
          { t: 'line', x1: 0, y1: half, x2: w, y2: half, color: mixHex(input.style.fg, input.style.bg, 0.6), width: 0.3, dash: true },
        ],
      };
    }
    case 'sticker': {
      const s = 90;
      return { width: s, height: s, title, prims: stickerFace(input, s, s) };
    }
    case 'plain':
    default: {
      const s = 60;
      return {
        width: s,
        height: s,
        title,
        prims: [
          { t: 'rect', x: 0, y: 0, w: s, h: s, fill: input.style.bg },
          { t: 'qr', x: 0, y: 0, size: s, matrix: input.matrix, color: input.style.fg, quiet: QUIET },
        ],
      };
    }
  }
}

function shiftPrim(p: Prim, dy: number): Prim {
  switch (p.t) {
    case 'rect':
    case 'qr':
    case 'text':
      return { ...p, y: p.y + dy };
    case 'line':
      return { ...p, y1: p.y1 + dy, y2: p.y2 + dy };
    case 'rotate180':
      return { ...p, cy: p.cy + dy, children: p.children.map((c) => shiftPrim(c, dy)) };
  }
}

// ───────────────────────────── QR yolu ─────────────────────────────

/** Satır başına koyu modül dizileri: [satır, başlangıç sütunu, uzunluk]. */
export function qrRuns(matrix: QrMatrix): Array<[number, number, number]> {
  const runs: Array<[number, number, number]> = [];
  for (let r = 0; r < matrix.size; r++) {
    const row = matrix.rows[r];
    let c = 0;
    while (c < matrix.size) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < matrix.size && row[c]) c++;
      runs.push([r, start, c - start]);
    }
  }
  return runs;
}

// ───────────────────────────── SVG ─────────────────────────────

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string);
}

const n = (v: number) => +v.toFixed(3);

function primToSvg(p: Prim): string {
  switch (p.t) {
    case 'rect':
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${p.fill}"/>`;
    case 'qr': {
      const total = p.matrix.size + p.quiet * 2;
      const m = p.size / total;
      const d = qrRuns(p.matrix)
        .map(([r, c, len]) => `M${c + p.quiet} ${r + p.quiet}h${len}v1h-${len}z`)
        .join('');
      return `<path transform="translate(${n(p.x)} ${n(p.y)}) scale(${n(m)})" d="${d}" fill="${p.color}" shape-rendering="crispEdges"/>`;
    }
    case 'text':
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${n(p.size)}"${p.bold ? ' font-weight="700"' : ''} fill="${p.color}"${p.anchor === 'middle' ? ' text-anchor="middle"' : ''}>${escapeXml(p.text)}</text>`;
    case 'line':
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.color}" stroke-width="${n(p.width)}"${p.dash ? ' stroke-dasharray="2 2"' : ''}/>`;
    case 'rotate180':
      return `<g transform="rotate(180 ${n(p.cx)} ${n(p.cy)})">${p.children.map(primToSvg).join('')}</g>`;
  }
}

/** Sayfa → bağımsız SVG belgesi (mm boyutlu; yazdırmada gerçek ölçü). */
export function renderSvg(page: PrintPage): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">` +
    `<title>${escapeXml(page.title)}</title>` +
    page.prims.map(primToSvg).join('') +
    `</svg>`
  );
}
