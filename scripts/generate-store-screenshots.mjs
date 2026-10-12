#!/usr/bin/env node
/**
 * Mağaza ekran görüntüsü TASLAKLARI: docs/design/galeri'deki mobil (390px) tam sayfa görüntülerden
 * üst kısmı kırpıp mağaza boyutlarına getirir.
 *   node scripts/generate-store-screenshots.mjs
 * Çıktı: docs/native/store/screenshots/{ios-6.9,play-phone}/NN-<ad>-<tema>.jpg
 *   ios-6.9    1290x2796 (App Store 6.7"/6.9" iPhone; zorunlu boyut sınıfı)
 *   play-phone 1080x1920 (Google Play telefon, 9:16)
 * Not: galeri görüntüleri tarayıcıdan alındı (durum çubuğu yok, demo veri). Yayından önce
 * gerçek cihaz/simülatör görüntüsüyle değiştirilmesi önerilir — liste: docs/native/store/screenshots.md.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = (id) => path.join(root, 'docs', 'design', 'galeri', 'img', `${id}-l.webp`);

/** Sıra = mağazadaki sıra. İlk 3 görüntü en çok görülenlerdir: değer önerisi önce. */
export const SHOTS = [
  { n: '01-ana-sayfa', id: '0654' },
  { n: '02-qr-tara', id: '0658' },
  { n: '03-oduller', id: '0794' },
  { n: '04-kartim', id: '0767' },
  { n: '05-firsatlar', id: '0801' },
  { n: '06-profil', id: '0711' },
  { n: '07-mekanlar', id: '0819' },
  { n: '08-bayi-islem-defteri', id: '0540' },
];
const TARGETS = [
  { dir: 'ios-6.9', w: 1290, h: 2796 },
  { dir: 'play-phone', w: 1080, h: 1920 },
];

for (const t of TARGETS) {
  const out = path.join(root, 'docs', 'native', 'store', 'screenshots', t.dir);
  await mkdir(out, { recursive: true });
  for (const s of SHOTS) {
    const src = sharp(img(s.id));
    const { width = 0, height = 0 } = await src.metadata();
    const cropH = Math.min(height, Math.round((width * t.h) / t.w));
    const file = path.join(out, `${s.n}-koyu.jpg`);
    await sharp(img(s.id))
      .extract({ left: 0, top: 0, width, height: cropH })
      .resize(t.w, t.h, { fit: 'cover', position: 'top' })
      .flatten({ background: '#0a0a0a' })
      .jpeg({ quality: 88, mozjpeg: true }) // mağazalar JPG kabul eder; PNG'ye göre ~10x küçük
      .toFile(file);
    console.log(`✓ ${path.relative(root, file)}`);
  }
}
