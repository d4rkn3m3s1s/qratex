#!/usr/bin/env node
/**
 * PWA manifest için gerçek PNG ikonlar üretir (SVG logodan, sharp ile).
 *   node scripts/generate-pwa-icons.mjs
 * Kaynak: public/icons/icon-512x512.svg
 * Çıktı : public/icons/icon-192x192.png, icon-512x512.png, icon-maskable-512x512.png
 * Maskable sürüm: köşe yuvarlatması yok (tam dolu arka plan), glif %80 güvenli alanda.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'public', 'icons');
const src = await readFile(path.join(iconsDir, 'icon-512x512.svg'), 'utf8');

const maskable = src
  .replace(/<rect([^>]*?)\s+rx="[^"]*"/, '<rect$1')
  .replace(/<text([^>]*?)>/, (m) =>
    m.replace(/font-size="(\d+(?:\.\d+)?)"/, (_, s) => `font-size="${Math.round(Number(s) * 0.8)}"`)
      .replace(/y="(\d+(?:\.\d+)?)"/, (_, y) => `y="${(256 + (Number(y) - 256) * 0.8).toFixed(2)}"`),
  );

const jobs = [
  { svg: src, size: 192, out: 'icon-192x192.png' },
  { svg: src, size: 512, out: 'icon-512x512.png' },
  { svg: maskable, size: 512, out: 'icon-maskable-512x512.png' },
];

for (const j of jobs) {
  const buf = await sharp(Buffer.from(j.svg), { density: 300 }).resize(j.size, j.size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(iconsDir, j.out), buf);
  console.log(`✓ ${j.out} (${buf.length} B)`);
}
