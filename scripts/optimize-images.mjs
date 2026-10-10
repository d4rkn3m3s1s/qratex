#!/usr/bin/env node
/**
 * Görsel varlık hattı — "raster sarmalayan" SVG'leri optimize eder.
 *
 * Kök neden (docs/audit/2026-10-08/sistem/performans.md K2): avatar SVG'leri Illustrator
 * dışa aktarımı; içinde 1024×1024 PNG (base64) + Illustrator'ın özel `i:pgf` verisi var.
 * Dosya başına ~3,4 MB, 70 avatar = 226 MB. Tarayıcı 14 px'lik bir ikon için bile
 * dosyanın tamamını indiriyor; next/image SVG'yi optimize etmiyor.
 *
 * Bu betik, `RASTER_DIRS` altındaki her SVG için:
 *   1. SVG'yi (viewBox/transform'a sadık kalarak) sharp/librsvg ile 2× çözünürlükte
 *      rasterize eder, en uzun kenarı TARGET px olacak şekilde lanczos ile küçültür,
 *      WebP olarak kodlar.
 *   2. Eski yolu (`/images/avatar/AVATAR ERKEK 1.svg`) KORUR, ama içeriğini aynı WebP'yi
 *      gömen ~20 KB'lık ince bir SVG ile değiştirir. Böylece veritabanında `user.image`
 *      olarak saklanan eski yollar, kodun her yerindeki <img>/AvatarImage kullanımı ve
 *      seed verisi DEĞİŞMEDEN hafifler (canlı DB göçü gerekmez).
 *   3. `emitOptimized: true` dizinler için içerik hash'li bağımsız WebP dosyası üretir
 *      (`public/images/avatar/opt/avatar-erkek-1.<hash>.webp`). Hash'li ad sayesinde
 *      next.config.js bu klasöre `immutable` önbellek başlığı verir; next/image bu
 *      dosyaları ayrıca boyutlandırır. Eski yol → yeni yol eşlemesi
 *      `lib/avatar-image-map.generated.ts` dosyasına yazılır (lib/avatar-options.ts okur).
 *
 * İdempotent: ince SVG `data-qratex-optimized` işaretini taşır; ikinci çalıştırmada
 * yeniden kodlama YAPILMAZ (kuşak kaybı olmaz) — gömülü WebP baytları aynen çıkarılıp
 * hash'li dosya ve eşleme tablosu yeniden üretilir.
 *
 * Kullanım:  node scripts/optimize-images.mjs [--dry-run]
 * Veritabanına veya ağa DOKUNMAZ; yalnız public/ ve lib/avatar-image-map.generated.ts yazar.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAP_FILE = path.join(ROOT, 'lib', 'avatar-image-map.generated.ts');
const DRY_RUN = process.argv.includes('--dry-run');

/** En uzun kenar (px). Avatarlar en fazla ~128 CSS px gösteriliyor → 512 px 4× retina payı bırakır. */
const TARGET = 512;
const WEBP_OPTIONS = { quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true };
const MARKER = 'data-qratex-optimized';

/** @type {{ dir: string; emitOptimized: boolean }[]} */
const RASTER_DIRS = [
  { dir: 'images/avatar', emitOptimized: true },
  // Yalnız bir dosyası kodda kullanılıyor (journey-score maskotu); geri kalanı yerinde hafifletilir.
  { dir: 'images/zamanikimizisilerizimizideğil', emitOptimized: false },
];

const TR_MAP = { İ: 'i', I: 'i', ı: 'i', Ş: 's', ş: 's', Ğ: 'g', ğ: 'g', Ü: 'u', ü: 'u', Ö: 'o', ö: 'o', Ç: 'c', ç: 'c' };

/** "BAYİ AVATAR KADIN 6" → "bayi-avatar-kadin-6" (ASCII, URL-güvenli). */
export function slugify(name) {
  return name
    .normalize('NFC')
    .replace(/[İIıŞşĞğÜüÖöÇç]/g, (c) => TR_MAP[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseViewBox(svg) {
  const m = svg.match(/viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*"/);
  if (!m) return null;
  const w = Number(m[3]);
  const h = Number(m[4]);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : null;
}

function targetSize(vb) {
  const scale = TARGET / Math.max(vb.w, vb.h);
  return { width: Math.max(1, Math.round(vb.w * scale)), height: Math.max(1, Math.round(vb.h * scale)) };
}

async function rasterize(svgText, vb) {
  const { width, height } = targetSize(vb);
  // 2× yoğunlukta çiz, sonra lanczos ile küçült: librsvg'nin gömülü PNG'yi düşük
  // yoğunlukta örneklemesinden doğan kenar tırtıklarını önler.
  const density = (72 * (2 * Math.max(width, height))) / Math.max(vb.w, vb.h);
  return sharp(Buffer.from(svgText), { density, limitInputPixels: false })
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .webp(WEBP_OPTIONS)
    .toBuffer();
}

function slimSvg(webp, width, height) {
  const b64 = webp.toString('base64');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${width} ${height}" ${MARKER}="webp-${TARGET}">` +
    `<image width="${width}" height="${height}" xlink:href="data:image/webp;base64,${b64}"/></svg>\n`
  );
}

function extractEmbeddedWebp(svgText) {
  const m = svgText.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
  return m ? Buffer.from(m[1], 'base64') : null;
}

function shortHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

function fmt(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function processDir({ dir, emitOptimized }) {
  const abs = path.join(PUBLIC_DIR, dir);
  if (!fs.existsSync(abs)) return { before: 0, after: 0, count: 0, map: {} };
  const optDir = path.join(abs, 'opt');
  const map = {};
  const keepOpt = new Set();
  let before = 0;
  let after = 0;
  let count = 0;

  const files = fs.readdirSync(abs).filter((f) => f.toLowerCase().endsWith('.svg')).sort();
  for (const file of files) {
    const filePath = path.join(abs, file);
    const svgText = fs.readFileSync(filePath, 'utf8');
    const size = Buffer.byteLength(svgText);
    const alreadySlim = svgText.includes(MARKER);

    let webp;
    let dims;
    if (alreadySlim) {
      webp = extractEmbeddedWebp(svgText);
      const vb = parseViewBox(svgText);
      if (!webp || !vb) {
        console.warn(`  ! ${dir}/${file}: işaretli ama gömülü WebP okunamadı, atlandı`);
        continue;
      }
      dims = { width: vb.w, height: vb.h };
    } else {
      // Yalnız raster sarmalayan SVG'ler: gerçek vektörlere (ör. tek vektör dosya) dokunma.
      if (!/<image[\s\S]*?data:image\/(png|jpe?g|webp)/i.test(svgText)) continue;
      const vb = parseViewBox(svgText);
      if (!vb) {
        console.warn(`  ! ${dir}/${file}: viewBox yok, atlandı`);
        continue;
      }
      webp = await rasterize(svgText, vb);
      dims = targetSize(vb);
      const slim = slimSvg(webp, dims.width, dims.height);
      if (!DRY_RUN) fs.writeFileSync(filePath, slim);
      before += size;
      after += Buffer.byteLength(slim);
      count += 1;
      console.log(`  ✓ ${dir}/${file}: ${fmt(size)} → ${fmt(Buffer.byteLength(slim))}`);
    }

    if (emitOptimized) {
      const base = slugify(file.replace(/\.svg$/i, ''));
      const outName = `${base}.${shortHash(webp)}.webp`;
      keepOpt.add(outName);
      if (!DRY_RUN) {
        fs.mkdirSync(optDir, { recursive: true });
        const outPath = path.join(optDir, outName);
        if (!fs.existsSync(outPath)) fs.writeFileSync(outPath, webp);
      }
      const legacyUrl = `/${dir}/${file}`.normalize('NFC');
      map[legacyUrl] = `/${dir}/opt/${outName}`;
    }
  }

  // Eski hash'lerden kalan yetim dosyaları temizle (aynı slug'ın önceki sürümleri).
  if (emitOptimized && !DRY_RUN && fs.existsSync(optDir)) {
    for (const f of fs.readdirSync(optDir)) {
      if (f.endsWith('.webp') && !keepOpt.has(f)) fs.unlinkSync(path.join(optDir, f));
    }
  }

  return { before, after, count, map };
}

function writeMap(map) {
  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, 'tr'));
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n');
  const content =
    `// BU DOSYA ÜRETİLİR — elle düzenlemeyin. Kaynak: scripts/optimize-images.mjs\n` +
    `// Eski (veritabanında saklanan) avatar yolu → içerik hash'li ${TARGET} px WebP.\n` +
    `export const AVATAR_OPTIMIZED_MAP: Readonly<Record<string, string>> = {\n${body}\n};\n`;
  if (!DRY_RUN) fs.writeFileSync(MAP_FILE, content);
}

async function main() {
  const fullMap = {};
  let totalBefore = 0;
  let totalAfter = 0;
  let totalCount = 0;
  for (const target of RASTER_DIRS) {
    console.log(`→ public/${target.dir}`);
    const r = await processDir(target);
    Object.assign(fullMap, r.map);
    totalBefore += r.before;
    totalAfter += r.after;
    totalCount += r.count;
  }
  writeMap(fullMap);
  console.log(
    `\n${DRY_RUN ? '[dry-run] ' : ''}${totalCount} dosya yeniden kodlandı: ${fmt(totalBefore)} → ${fmt(totalAfter)}; ` +
      `eşleme: ${Object.keys(fullMap).length} giriş → ${path.relative(ROOT, MAP_FILE)}`,
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
