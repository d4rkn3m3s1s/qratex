/**
 * Bağımlılıksız, vektörel PDF yazıcı — `print-layout` sayfalarını (mm) PDF'e çevirir.
 *
 * Neden elle: projede PDF kütüphanesi yok (npm install yasak) ve çıktı yalnız dikdörtgen,
 * çizgi, döndürme ve tek satır yazıdan oluşuyor. Yazı PDF'in standart Helvetica fontuyla
 * yazılır; Türkçe harfler (ğ Ğ ş Ş ı İ) WinAnsi'de olmadığından `/Differences` ile standart
 * glif adlarına (gbreve, scedilla, dotlessi, Idotaccent …) eşlenir → gömülü font gerekmez.
 *
 * Koordinat: sayfa içeriği `k 0 0 -k 0 H cm` ile mm + yukarıdan-aşağı eksene çevrilir; yazı
 * matrisi (`Tm`) y'yi yeniden çevirerek glifleri dik tutar.
 */
import { qrRuns, textWidth, type Prim, type PrintPage } from './print-layout';

const MM = 72 / 25.4;

/** WinAnsi dışında kalan Türkçe harfler → özel kod (128+) ve standart glif adı. */
const EXTRA_GLYPHS: Array<[string, string]> = [
  ['Ğ', 'Gbreve'],
  ['ğ', 'gbreve'],
  ['Ş', 'Scedilla'],
  ['ş', 'scedilla'],
  ['İ', 'Idotaccent'],
  ['ı', 'dotlessi'],
];
const EXTRA_CODE = new Map(EXTRA_GLYPHS.map(([ch], i) => [ch, 128 + i]));

/** WinAnsi'de zaten olan Latin-1 harfler. */
const WIN_ANSI = new Map<string, number>([
  ['Ç', 0xc7], ['ç', 0xe7], ['Ö', 0xd6], ['ö', 0xf6], ['Ü', 0xdc], ['ü', 0xfc],
  ['Â', 0xc2], ['â', 0xe2], ['Î', 0xce], ['î', 0xee], ['Û', 0xdb], ['û', 0xfb],
  ['é', 0xe9], ['É', 0xc9], ['·', 0xb7],
]);

/** Yazıyı PDF dize sözdizimine çevir (ASCII dışı → sekizli kaçış). */
export function encodePdfText(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (c >= 32 && c <= 126) out += ch;
    else {
      const code = EXTRA_CODE.get(ch) ?? WIN_ANSI.get(ch);
      out += code != null ? `\\${code.toString(8).padStart(3, '0')}` : '?';
    }
  }
  return out;
}

const f = (v: number) => {
  const s = (+v.toFixed(3)).toString();
  return s === '-0' ? '0' : s;
};

function rgb(hex: string): string {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return c.map((x) => f(x)).join(' ');
}

function primOps(p: Prim, out: string[]): void {
  switch (p.t) {
    case 'rect':
      out.push(`${rgb(p.fill)} rg ${f(p.x)} ${f(p.y)} ${f(p.w)} ${f(p.h)} re f`);
      return;
    case 'qr': {
      const total = p.matrix.size + p.quiet * 2;
      const m = p.size / total;
      out.push(`${rgb(p.color)} rg`);
      // Hafif taşma (0,01 mm) bitişik modüller arasında görüntüleyici kaynaklı ince çizgileri önler.
      const bleed = 0.01;
      for (const [r, c, len] of qrRuns(p.matrix)) {
        out.push(`${f(p.x + (c + p.quiet) * m)} ${f(p.y + (r + p.quiet) * m)} ${f(len * m + bleed)} ${f(m + bleed)} re`);
      }
      out.push('f');
      return;
    }
    case 'text': {
      const x = p.anchor === 'middle' ? p.x - textWidth(p.text, p.size, p.bold) / 2 : p.x;
      out.push(
        `BT /${p.bold ? 'F2' : 'F1'} 1 Tf ${rgb(p.color)} rg ${f(p.size)} 0 0 ${f(-p.size)} ${f(x)} ${f(p.y)} Tm (${encodePdfText(p.text)}) Tj ET`
      );
      return;
    }
    case 'line':
      out.push(
        `${rgb(p.color)} RG ${f(p.width)} w ${p.dash ? '[2 2] 0 d' : '[] 0 d'} ${f(p.x1)} ${f(p.y1)} m ${f(p.x2)} ${f(p.y2)} l S`
      );
      return;
    case 'rotate180':
      out.push(`q -1 0 0 -1 ${f(p.cx * 2)} ${f(p.cy * 2)} cm`);
      for (const c of p.children) primOps(c, out);
      out.push('Q');
      return;
  }
}

/** Sayfa içerik akışı (test edilebilir). */
export function pageContent(page: PrintPage): string {
  const out: string[] = [`q ${f(MM)} 0 0 ${f(-MM)} 0 ${f(page.height * MM)} cm`];
  for (const p of page.prims) primOps(p, out);
  out.push('Q');
  return out.join('\n');
}

/** Sayfaları tek PDF belgesine yaz. Her sayfa kendi boyutunu taşır. */
export function renderPdf(pages: PrintPage[], meta: { title: string }): Uint8Array {
  if (pages.length === 0) throw new Error('renderPdf: sayfa yok');
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length; // nesne numarası (1 tabanlı)
  };
  const differences = `[128 ${EXTRA_GLYPHS.map(([, g]) => `/${g}`).join(' ')}]`;
  const enc = add(`<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${differences} >>`);
  const f1 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${enc} 0 R >>`);
  const f2 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding ${enc} 0 R >>`);
  const pagesId = objects.length + 1;
  add('PAGES_PLACEHOLDER');
  const kids: number[] = [];
  for (const page of pages) {
    const content = pageContent(page);
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(page.width * MM)} ${f(page.height * MM)}] ` +
          `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    );
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const info = add(`<< /Title (${encodePdfText(meta.title)}) /Producer (Qratex) >>`);

  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Tüm içerik tek baytlık (latin1) karakterlerden oluşur → uzunluk = bayt sayısı.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
