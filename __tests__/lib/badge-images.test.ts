/**
 * Performans K2 — rozet görselleri. Eski durum: 85 vektör SVG ≈ 40 MB (dosya başına 0,5–1 MB);
 * rozet ızgarası 140 px'lik kartlar için her birini tam indiriyordu (next/image SVG'yi optimize etmez).
 */
import fs from 'node:fs';
import path from 'node:path';
import { BADGE_THUMB_MAP } from '@/lib/badge-image-map.generated';
import { isPresetBadgeImage, resolveBadgeThumb } from '@/lib/badge-images';
import { BADGE_CATALOG } from '@/lib/badge-catalog';

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');
const fileFor = (url: string) => path.join(PUBLIC_DIR, ...url.replace(/^\//, '').split('/'));

describe('rozet küçük resim bütçesi', () => {
  const entries = Object.entries(BADGE_THUMB_MAP);

  it('public/images/badges altındaki her SVG için eşleme var', () => {
    const svgs = fs
      .readdirSync(path.join(PUBLIC_DIR, 'images', 'badges'))
      .filter((f) => f.toLowerCase().endsWith('.svg'))
      .map((f) => `/images/badges/${f}`.normalize('NFC'));
    expect(Object.keys(BADGE_THUMB_MAP).sort()).toEqual(svgs.sort());
  });

  it('her küçük resim var, hash’li adlı ve 40 KB altında; özgün SVG yerinde', () => {
    for (const [original, thumb] of entries) {
      expect(thumb).toMatch(/^\/images\/badges\/opt\/[a-z0-9-]+\.[0-9a-f]{10}\.webp$/);
      expect(fs.statSync(fileFor(thumb)).size).toBeLessThan(40 * 1024);
      expect(fs.existsSync(fileFor(original))).toBe(true);
    }
  });

  it('bütün rozet ızgarası 2 MB altında (eskiden ≈ 40 MB)', () => {
    const total = entries.reduce((sum, [, thumb]) => sum + fs.statSync(fileFor(thumb)).size, 0);
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });

  it('katalogdaki rozet ikonlarının hepsi küçük resme çözülür', () => {
    const icons = BADGE_CATALOG
      .map((b) => b.icon)
      .filter((icon) => icon.startsWith('/images/badges/'));
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(resolveBadgeThumb(icon)).toMatch(/\/opt\/.+\.webp$/);
  });
});

describe('resolveBadgeThumb', () => {
  const sample = Object.keys(BADGE_THUMB_MAP).find((k) => /[İıüşğöç ]/.test(k))!;

  it('kodlanmış, mutlak ve NFD biçimleri de çözer', () => {
    const expected = resolveBadgeThumb(sample);
    expect(expected).toMatch(/\.webp$/);
    expect(resolveBadgeThumb(encodeURI(sample))).toBe(expected);
    expect(resolveBadgeThumb(`https://qratex.app${encodeURI(sample)}?v=2`)).toBe(expected);
    expect(resolveBadgeThumb(sample.normalize('NFD'))).toBe(expected);
    expect(isPresetBadgeImage(sample)).toBe(true);
  });

  it('hazır olmayan değerleri aynen döner; boşta null', () => {
    expect(resolveBadgeThumb('https://cdn.example.com/badge.png')).toBe('https://cdn.example.com/badge.png');
    expect(resolveBadgeThumb('🏆')).toBe('🏆');
    expect(resolveBadgeThumb('')).toBeNull();
    expect(resolveBadgeThumb(undefined)).toBeNull();
    expect(isPresetBadgeImage('/images/uploads/x.png')).toBe(false);
  });
});
