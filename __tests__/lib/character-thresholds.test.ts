/**
 * Karakter kategori eşiği override'ları — normalize GÜVENLİK katmanı: DB'den gelen ham
 * JSON yalnız BİLİNEN kategori key'leri + geçerli sayılar olarak kabul edilir (whitelist);
 * bozuk/kötü değer atılır → kod-içi default'a düşülür (fail-safe).
 */
jest.mock('@/lib/prisma', () => ({ prisma: { settings: { findUnique: () => Promise.resolve(null) } } }));

import { normalizeCategoryThresholds } from '@/lib/character-thresholds';
import { categoryThreshold, categoryMinReviewLength, CATEGORY_BY_KEY, DEFAULT_CATEGORY_THRESHOLD } from '@/lib/character-categories';

describe('normalizeCategoryThresholds', () => {
  it('geçerli override kabul edilir', () => {
    const r = normalizeCategoryThresholds({ gizemli: { threshold: 30, minReviewLength: 150 } });
    expect(r.gizemli).toEqual({ threshold: 30, minReviewLength: 150 });
  });

  it('bilinmeyen kategori key atılır (whitelist)', () => {
    const r = normalizeCategoryThresholds({ 'yok-boyle-kategori': { threshold: 5 } });
    expect(r).toEqual({});
  });

  it('geçersiz değerler atılır (0/negatif eşik, negatif uzunluk, string)', () => {
    const r = normalizeCategoryThresholds({
      gizemli: { threshold: 0, minReviewLength: -5 },   // threshold>0 değil, minLen<0
      komedi: { threshold: 'x', minReviewLength: 100 }, // threshold string → at, minLen geçerli
    });
    expect(r.gizemli).toBeUndefined();       // ikisi de geçersiz → giriş yok
    expect(r.komedi).toEqual({ minReviewLength: 100 }); // sadece geçerli alan kalır
  });

  it('minReviewLength 0 geçerlidir (uzunluk şartı yok demek)', () => {
    const r = normalizeCategoryThresholds({ gizemli: { minReviewLength: 0 } });
    expect(r.gizemli).toEqual({ minReviewLength: 0 });
  });

  it('null/dizi/primitive girdi → boş obje', () => {
    expect(normalizeCategoryThresholds(null)).toEqual({});
    expect(normalizeCategoryThresholds([1, 2])).toEqual({});
    expect(normalizeCategoryThresholds('nope')).toEqual({});
  });
});

describe('categoryThreshold / categoryMinReviewLength — override argümanı', () => {
  const gizemli = CATEGORY_BY_KEY['gizemli'];
  const dram = CATEGORY_BY_KEY['dram-suc'];

  it('override yoksa kod-default kullanılır (geriye uyum)', () => {
    expect(categoryThreshold(gizemli)).toBe(20);          // gizemli kod-default
    expect(categoryThreshold(dram)).toBe(DEFAULT_CATEGORY_THRESHOLD); // 6
    expect(categoryMinReviewLength(gizemli)).toBe(0);      // uzunluk şartı yok
  });

  it('override varsa onu kullanır', () => {
    const ov = { gizemli: { threshold: 30, minReviewLength: 150 } };
    expect(categoryThreshold(gizemli, ov)).toBe(30);
    expect(categoryMinReviewLength(gizemli, ov)).toBe(150);
    // Override edilmeyen kategori kod-default'ta kalır
    expect(categoryThreshold(dram, ov)).toBe(DEFAULT_CATEGORY_THRESHOLD);
  });

  it('override kısmi (yalnız threshold) → minLen kod-default', () => {
    const ov = { gizemli: { threshold: 25 } };
    expect(categoryThreshold(gizemli, ov)).toBe(25);
    expect(categoryMinReviewLength(gizemli, ov)).toBe(0); // minLen override yok → default 0
  });
});
