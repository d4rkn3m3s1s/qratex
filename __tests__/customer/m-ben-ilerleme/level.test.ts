/**
 * Ben → İlerleme: seviye eğrisi tek kaynakla (calculateLevel) tutarlı mı?
 * progress-hub bulgu 1 / trends bulgu 2: doğrusal "her seviye 1000 XP" hesabı
 * Seviye 2'nin ortasından itibaren yanlış, Seviye 4+'te hep %100 gösteriyordu.
 */
import { calculateLevel } from '@/lib/utils';
import {
  daysToNextLevel,
  levelBounds,
  levelFromXp,
  levelProgress,
  levelSpan,
  upcomingLevels,
} from '@/components/customer/m-ben-ilerleme/level';

describe('levelBounds / levelFromXp', () => {
  it('eşikler geometrik: 0 → 1000 → 2500 → 4750 → 8125 → 13187', () => {
    expect([1, 2, 3, 4, 5, 6].map((l) => levelBounds(l).start)).toEqual([0, 1000, 2500, 4750, 8125, 13187]);
    expect(levelSpan(1)).toBe(1000);
    expect(levelSpan(2)).toBe(1500);
    expect(levelSpan(5)).toBe(5062);
  });

  it('her seviyenin başı ve bir eksiği calculateLevel ile birebir', () => {
    for (let l = 2; l <= 25; l++) {
      const { start } = levelBounds(l);
      expect(calculateLevel(start)).toBe(l);
      expect(calculateLevel(start - 1)).toBe(l - 1);
      expect(levelFromXp(start)).toBe(l);
      expect(levelFromXp(start - 1)).toBe(l - 1);
    }
  });

  it('negatif / bozuk XP 1. seviye', () => {
    expect(levelFromXp(-50)).toBe(1);
    expect(levelFromXp(Number.NaN)).toBe(1);
  });
});

describe('levelProgress', () => {
  it('XP=2000: Seviye 2, 1000/1500, %66 (eski hesap %100 diyordu)', () => {
    const p = levelProgress(2000, 2);
    expect(p).toMatchObject({ level: 2, xpIntoLevel: 1000, xpForLevel: 1500, xpToNext: 500, percent: 66 });
  });

  it('XP=4750: Seviye 4 başında %0 ve 3375 XP kaldı (eski: "1.750 / 1.000")', () => {
    const p = levelProgress(4750, 4);
    expect(p).toMatchObject({ level: 4, xpIntoLevel: 0, xpForLevel: 3375, xpToNext: 3375, percent: 0 });
  });

  it('ilerleme 0–100 aralığından çıkmaz (sınır değerler)', () => {
    for (const xp of [0, 999, 1000, 2499, 2500, 4749, 4750, 8124, 8125, 50_000, 10_000_000]) {
      const p = levelProgress(xp, calculateLevel(xp));
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
      expect(p.xpIntoLevel).toBeLessThanOrEqual(p.xpForLevel);
      expect(p.xp + p.xpToNext).toBe(p.nextLevelXp);
    }
  });

  it('admin seviyeyi elle yükseltmişse (XP başlangıcın altında) ilerleme 0, kalan gerçek eşiğe göre', () => {
    // Eski set_level XP'yi (level-1)*1000 yazıyordu: Seviye 4 → 3000 XP.
    const p = levelProgress(3000, 4);
    expect(p).toMatchObject({ level: 4, xpIntoLevel: 0, xpToNext: 8125 - 3000, percent: 0 });
  });

  it('DB seviyesi geride kaldıysa seviye XP\'den türetilir (asla %100\'e kilitlenmez)', () => {
    const p = levelProgress(9000, 2);
    expect(p.level).toBe(5);
    expect(p.percent).toBeLessThan(100);
  });
});

describe('upcomingLevels / daysToNextLevel', () => {
  it('sonraki üç seviye kümülatif eşik ve kalanla', () => {
    const list = upcomingLevels(levelProgress(3000, 3), 3);
    expect(list).toEqual([
      { level: 4, atXp: 4750, remaining: 1750 },
      { level: 5, atXp: 8125, remaining: 5125 },
      { level: 6, atXp: 13187, remaining: 10187 },
    ]);
  });

  it('tempo yoksa tahmin yok; uzun vadeli tahmin gizlenir', () => {
    expect(daysToNextLevel(1000, 0, 30)).toBeNull();
    expect(daysToNextLevel(1000, 300, 30)).toBe(100);
    expect(daysToNextLevel(100_000, 30, 30)).toBeNull();
    expect(daysToNextLevel(0, 300, 30)).toBeNull();
  });
});
