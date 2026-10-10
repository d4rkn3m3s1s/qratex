/**
 * An Motoru sahne renk tabloları (spec §3): lig → hex çifti, nadirlik → hex çifti,
 * rozet `color` önceliği ve yardımcıların geçersiz girdiye dayanıklılığı.
 */
import {
  BRAND_SCENE_COLORS,
  LEAGUE_SCENE_COLORS,
  RARITY_SCENE_COLORS,
  SCENE_RARITIES,
  SCENE_RARITY_LABEL,
  getBadgeSceneColors,
  getLeagueSceneColors,
  hexToRgb,
  hexToRgba,
  lightenHex,
  mixHex,
  normalizeHex,
  normalizeSceneRarity,
  sceneBackdrop,
  sceneGradient,
} from '@/lib/moments/scene-colors';
import { DEFAULT_LEAGUE_RULES } from '@/lib/league-rules-core';

const HEX6 = /^#[0-9a-f]{6}$/;

describe('LEAGUE_SCENE_COLORS', () => {
  it('her varsayılan lig anahtarı için geçerli bir hex çifti tanımlı', () => {
    for (const rule of DEFAULT_LEAGUE_RULES) {
      const pair = LEAGUE_SCENE_COLORS[rule.key];
      expect(pair).toBeDefined();
      expect(pair[0]).toMatch(HEX6);
      expect(pair[1]).toMatch(HEX6);
    }
    expect(Object.keys(LEAGUE_SCENE_COLORS).sort()).toEqual(DEFAULT_LEAGUE_RULES.map((r) => r.key).sort());
  });

  it('getLeagueSceneColors: büyük/küçük harf ve boşluk toleranslı', () => {
    expect(getLeagueSceneColors(' vetra ')).toBe(LEAGUE_SCENE_COLORS.VETRA);
    expect(getLeagueSceneColors('KOR')).toBe(LEAGUE_SCENE_COLORS.KOR);
  });

  it('bilinmeyen / boş / prototip anahtarı → marka rengi (spec kararı)', () => {
    expect(getLeagueSceneColors('ELMAS')).toBe(BRAND_SCENE_COLORS);
    expect(getLeagueSceneColors('')).toBe(BRAND_SCENE_COLORS);
    expect(getLeagueSceneColors(null)).toBe(BRAND_SCENE_COLORS);
    expect(getLeagueSceneColors(undefined)).toBe(BRAND_SCENE_COLORS);
    expect(getLeagueSceneColors('constructor')).toBe(BRAND_SCENE_COLORS);
    expect(getLeagueSceneColors('__proto__')).toBe(BRAND_SCENE_COLORS);
  });
});

describe('nadirlik tablosu', () => {
  it('dört kademe, her biri hex çifti ve Türkçe etiket', () => {
    expect(SCENE_RARITIES).toEqual(['common', 'rare', 'epic', 'legendary']);
    for (const r of SCENE_RARITIES) {
      expect(RARITY_SCENE_COLORS[r][0]).toMatch(HEX6);
      expect(RARITY_SCENE_COLORS[r][1]).toMatch(HEX6);
      expect(SCENE_RARITY_LABEL[r].length).toBeGreaterThan(0);
    }
    expect(SCENE_RARITY_LABEL.legendary).toBe('Efsanevi');
    expect(SCENE_RARITY_LABEL.epic).toBe('Destansı');
  });

  it('normalizeSceneRarity: serbest DB metni → kademe, bilinmeyen → common', () => {
    expect(normalizeSceneRarity('LEGENDARY')).toBe('legendary');
    expect(normalizeSceneRarity(' Rare ')).toBe('rare');
    expect(normalizeSceneRarity('mythic')).toBe('common');
    expect(normalizeSceneRarity(42)).toBe('common');
    expect(normalizeSceneRarity(null)).toBe('common');
  });
});

describe('getBadgeSceneColors', () => {
  it('rozetin geçerli kendi rengi nadirliği ezer (ikincil = aynı rengin açığı)', () => {
    const pair = getBadgeSceneColors({ color: '#FF0000', rarity: 'legendary' });
    expect(pair[0]).toBe('#ff0000');
    expect(pair[1]).toBe(lightenHex('#ff0000', 0.35));
    expect(getBadgeSceneColors({ color: 'abc', rarity: 'rare' })[0]).toBe('#aabbcc');
  });

  it('renk boş/geçersizse nadirlik rengi (CSS enjeksiyonu kabul edilmez)', () => {
    expect(getBadgeSceneColors({ color: null, rarity: 'epic' })).toBe(RARITY_SCENE_COLORS.epic);
    expect(getBadgeSceneColors({ color: 'red', rarity: 'rare' })).toBe(RARITY_SCENE_COLORS.rare);
    expect(getBadgeSceneColors({ color: '#fff;background:url(x)', rarity: 'rare' })).toBe(RARITY_SCENE_COLORS.rare);
    expect(getBadgeSceneColors({ color: 'hsl(var(--brand))' })).toBe(RARITY_SCENE_COLORS.common);
  });
});

describe('renk yardımcıları', () => {
  it('normalizeHex / hexToRgb', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('7c3bed')).toBe('#7c3bed');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
    expect(hexToRgb('#7c3bed')).toEqual([124, 59, 237]);
    expect(hexToRgb('nope')).toEqual([0, 0, 0]);
  });

  it('mixHex sınırları kırpar ve NaN → başlangıç rengi', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', -1)).toBe('#000000');
    expect(mixHex('#102030', '#ffffff', Number.NaN)).toBe('#102030');
  });

  it('hexToRgba alfa kırpılır', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexToRgba('#ff0000', 9)).toBe('rgba(255, 0, 0, 1)');
  });

  it('sceneBackdrop / sceneGradient yalnız normalleştirilmiş renk üretir', () => {
    const bg = sceneBackdrop(LEAGUE_SCENE_COLORS.ZENOR);
    expect(bg).toContain('radial-gradient');
    expect(bg).toContain('linear-gradient');
    expect(bg).not.toMatch(/[;{}]/);
    expect(sceneGradient(['#111111', '#222222'])).toBe('linear-gradient(90deg, #111111, #222222)');
  });
});
