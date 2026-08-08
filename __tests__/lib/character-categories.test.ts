/**
 * Karakter kategori bütünlüğü: Karakter rozeti reveal ekonomisi, her karakterin
 * TAM BİR kategoriye ait olmasına ve kategori↔karakter eşlemesinin tutarlılığına
 * dayanır. Bir karakter iki kategoriye düşerse veya hiç kategorisi yoksa, gizli
 * bar/reveal yanlış kategoriyi seçer. Bu testler o değişmezleri korur.
 */
// character-badges.ts (CHARACTER_PROFILES kaynağı) lib/prisma'yı import ediyor;
// test ortamında PrismaClient başlatılmasın diye mock'la (bu testler saf veriyi sınar).
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

import {
  CHARACTER_CATEGORIES,
  CATEGORY_BY_KEY,
  CATEGORY_BY_CHARACTER,
  charactersInCategory,
  unassignedCharacterIds,
  FALLBACK_CATEGORY_KEY,
} from '@/lib/character-categories';
import { CHARACTER_PROFILES } from '@/lib/character-badges';

describe('character categories — bütünlük', () => {
  it('en az bir kategori vardır ve hepsinin key/name/characterIds alanı doludur', () => {
    expect(CHARACTER_CATEGORIES.length).toBeGreaterThan(0);
    for (const cat of CHARACTER_CATEGORIES) {
      expect(typeof cat.key).toBe('string');
      expect(cat.key.length).toBeGreaterThan(0);
      expect(typeof cat.name).toBe('string');
      expect(cat.name.length).toBeGreaterThan(0);
      expect(Array.isArray(cat.characterIds)).toBe(true);
      expect(cat.characterIds.length).toBeGreaterThan(0);
    }
  });

  it('kategori keyleri benzersizdir', () => {
    const keys = CHARACTER_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hiçbir karakter iki kategoriye birden ait değildir', () => {
    const seen = new Map<string, string>(); // badgeId -> categoryKey
    for (const cat of CHARACTER_CATEGORIES) {
      for (const id of cat.characterIds) {
        expect(seen.has(id)).toBe(false); // çakışma yok
        seen.set(id, cat.key);
      }
    }
  });

  it('her karakter profili tam bir kategoriye atanmıştır (atanmamış yok)', () => {
    expect(unassignedCharacterIds()).toEqual([]);
  });

  it('CATEGORY_BY_KEY her kategoriyi doğru döndürür', () => {
    for (const cat of CHARACTER_CATEGORIES) {
      expect(CATEGORY_BY_KEY[cat.key]).toBe(cat);
    }
  });

  it('CATEGORY_BY_CHARACTER her karakteri kendi kategorisine eşler', () => {
    for (const cat of CHARACTER_CATEGORIES) {
      for (const id of cat.characterIds) {
        expect(CATEGORY_BY_CHARACTER[id]?.key).toBe(cat.key);
      }
    }
  });

  it('charactersInCategory kategori üyelerini döndürür, bilinmeyen keyde boş', () => {
    const first = CHARACTER_CATEGORIES[0];
    const members = charactersInCategory(first.key);
    expect(members.map((m) => m.badgeId).sort()).toEqual([...first.characterIds].sort());
    expect(charactersInCategory('yok-boyle-kategori')).toEqual([]);
  });

  it('FALLBACK_CATEGORY_KEY geçerli bir kategoridir', () => {
    expect(CATEGORY_BY_KEY[FALLBACK_CATEGORY_KEY]).toBeDefined();
  });

  it('kategorilerdeki tüm badgeId\'ler gerçek karakter profilleridir', () => {
    const validIds = new Set(CHARACTER_PROFILES.map((p) => p.badgeId));
    for (const cat of CHARACTER_CATEGORIES) {
      for (const id of cat.characterIds) {
        expect(validIds.has(id)).toBe(true);
      }
    }
  });
});
