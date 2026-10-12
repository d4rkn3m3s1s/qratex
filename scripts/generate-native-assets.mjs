#!/usr/bin/env node
/**
 * Native uygulama ikon + açılış ekranı üretici (Android + iOS), sharp ile.
 *   node scripts/generate-native-assets.mjs
 *
 * Kaynak: public/icons/icon-512x512.svg (PWA ile aynı marka glifi; vektörden üretilir, kayıpsız).
 * Çıktılar:
 *   Android  res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png, ic_launcher_round.png,
 *            ic_launcher_foreground.png (adaptive, 108dp tuval, glif 66dp güvenli alanda)
 *            res/values/ic_launcher_background.xml (adaptive arka plan rengi)
 *            res/drawable-(port|land)-<yoğunluk>/splash.png (port/land, tüm yoğunluklar)
 *   iOS      Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png (1024, alfa YOK — App Store şartı)
 *            Assets.xcassets/Splash.imageset/splash-2732x2732*.png
 *   Mağaza   docs/native/store/assets/play-icon-512.png, feature-graphic-1024x500.png
 *
 * Renk/glif değişirse yalnız bu betiği yeniden çalıştırın; çıktılar git'te tutulur.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = await readFile(path.join(root, 'public', 'icons', 'icon-512x512.svg'), 'utf8');

/** Splash arka planı capacitor.config.ts SplashScreen.backgroundColor ile aynı olmalı. */
const SPLASH_BG = '#0a0a0a';
/** Adaptive ikon arka planı: gradyanın orta durağı (tek renk; gradyan foreground'da değil). */
const ADAPTIVE_BG = '#4F46E5';

const gradDefs = src.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';
const glyph = (x, y, size) =>
  `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="bold" fill="white" text-anchor="middle">Q</text>`;

/** Kare, köşesiz, tam dolu gradyan + glif (iOS sistem kendisi maskeler; legacy Android için de kullanılır). */
function squareSvg(radius = 0) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${gradDefs}<rect width="512" height="512" rx="${radius}" fill="url(#grad)"/>${glyph(256, 317.44, 204)}</svg>`;
}
/** Daire maskeli (ic_launcher_round). */
function roundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${gradDefs}<circle cx="256" cy="256" r="256" fill="url(#grad)"/>${glyph(256, 317.44, 204)}</svg>`;
}
/** Adaptive foreground: 108dp tuval, glif ortadaki 66dp güvenli dairenin içinde, şeffaf arka plan. */
function foregroundSvg() {
  // 512 tuvalde güvenli alan çapı 512*66/108 ≈ 313; glif boyu bunun ~%60'ı.
  const size = 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${glyph(256, 256 + size * 0.36, size)}</svg>`;
}
/** Açılış: koyu zemin ortasında yuvarlatılmış ikon. Tuval oranı hedefe göre. */
function splashSvg(w, h) {
  const icon = Math.round(Math.min(w, h) * 0.22);
  const x = (w - icon) / 2;
  const y = (h - icon) / 2;
  const s = icon / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${gradDefs}<rect width="${w}" height="${h}" fill="${SPLASH_BG}"/><g transform="translate(${x} ${y}) scale(${s})"><rect width="512" height="512" rx="112" fill="url(#grad)"/>${glyph(256, 317.44, 204)}</g></svg>`;
}

async function png(svg, w, h, out, { flatten = false } = {}) {
  let img = sharp(Buffer.from(svg), { density: 300 }).resize(w, h ?? w);
  if (flatten) img = img.flatten({ background: SPLASH_BG }).removeAlpha();
  const buf = await img.png({ compressionLevel: 9 }).toBuffer();
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log(`✓ ${path.relative(root, out)} (${w}x${h ?? w})`);
}

const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, k] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${d}`);
  await png(squareSvg(102.4), Math.round(48 * k), null, path.join(dir, 'ic_launcher.png'));
  await png(roundSvg(), Math.round(48 * k), null, path.join(dir, 'ic_launcher_round.png'));
  await png(foregroundSvg(), Math.round(108 * k), null, path.join(dir, 'ic_launcher_foreground.png'));
}
await writeFile(
  path.join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ADAPTIVE_BG}</color>\n</resources>\n`,
);

// Android splash (Capacitor SplashScreen eklentisi drawable/splash.png kullanır).
const portrait = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(portrait)) {
  await png(splashSvg(w, h), w, h, path.join(res, `drawable-port-${d}`, 'splash.png'), { flatten: true });
  await png(splashSvg(h, w), h, w, path.join(res, `drawable-land-${d}`, 'splash.png'), { flatten: true });
}
await png(splashSvg(480, 320), 480, 320, path.join(res, 'drawable', 'splash.png'), { flatten: true });

// iOS
const xc = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets');
await png(squareSvg(0), 1024, null, path.join(xc, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), { flatten: true });
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await png(splashSvg(2732, 2732), 2732, 2732, path.join(xc, 'Splash.imageset', f), { flatten: true });
}

// Mağaza görselleri
const store = path.join(root, 'docs', 'native', 'store', 'assets');
await png(squareSvg(0), 512, null, path.join(store, 'play-icon-512.png'), { flatten: true });
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">${gradDefs}<rect width="1024" height="500" fill="${SPLASH_BG}"/><g transform="translate(120 130) scale(0.47)"><rect width="512" height="512" rx="112" fill="url(#grad)"/>${glyph(256, 317.44, 204)}</g><text x="420" y="240" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white">Qratex</text><text x="422" y="300" font-family="Arial, sans-serif" font-size="30" fill="#a1a1aa">QR okut, değerlendir, puan kazan</text></svg>`;
await png(feature, 1024, 500, path.join(store, 'feature-graphic-1024x500.png'), { flatten: true });
