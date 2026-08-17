/**
 * KARAKTER ROZETİ AÇILIŞ TEMASI — kategori odaklı.
 *
 * Eski sistem: görkem yalnız `rarity`ye (common/rare/epic/legendary) bağlıydı; kategori rengi
 * arka planda kalıyordu. Yeni sistem: AÇILIŞIN KİMLİĞİ KATEGORİDİR (dram=kırmızı, komedi=sarı,
 * fantastik=mor, gizem/gerilim=mavi, gizemli=yeşil). Rarity yalnız "bu kategoride özel bir
 * yakalayış" olduğunda üstüne bir katman ekler — her kategoride efsanevi bulunmaz.
 *
 * Renkler `CHARACTER_CATEGORIES[].accent` ile hizalıdır; burada yalnız açılış sahnesinin
 * ışık/huzme/parçacık profili tanımlanır.
 */

import { getCharacterTier } from './character-reveal-texts';

export type CategoryRevealTheme = {
  /** Ana kimlik rengi (kategori accent'i ile aynı). */
  accent: string;
  /** İkincil ton — huzme/gradyan geçişi için. */
  accent2: string;
  /** Konfeti/parçacık paleti. */
  particles: string[];
  /** Sahne yoğunluğu 0-1 (parçacık + huzme ölçeği). */
  intensity: number;
  /** God-ray huzme sayısı (0 = kapalı). */
  rays: number;
  /** Reveal patlamasında ekran sarsılma genliği (px). */
  shake: number;
  /** Açılış üst başlığı — kategorinin karakterini anlatan kısa ibare. */
  tagline: string;
};

/** Kategori anahtarı → açılış sahnesi profili. Bilinmeyen anahtar `FALLBACK`e düşer. */
export const CATEGORY_REVEAL_THEMES: Record<string, CategoryRevealTheme> = {
  'dram-suc': {
    accent: '#dc2626',
    accent2: '#f87171',
    particles: ['#dc2626', '#f87171', '#7f1d1d', '#ffffff'],
    intensity: 0.85,
    rays: 10,
    shake: 6,
    tagline: 'TANIKLIK KAYDA GEÇTİ',
  },
  komedi: {
    accent: '#f59e0b',
    accent2: '#fde047',
    particles: ['#f59e0b', '#fde047', '#fb923c', '#ffffff'],
    intensity: 0.9,
    rays: 12,
    shake: 4,
    tagline: 'SAHNE SENİN',
  },
  fantastik: {
    accent: '#8b5cf6',
    accent2: '#c4b5fd',
    particles: ['#8b5cf6', '#c4b5fd', '#6d28d9', '#ffffff'],
    intensity: 0.88,
    rays: 14,
    shake: 5,
    tagline: 'YOLCULUK BAŞLIYOR',
  },
  'gizem-gerilim': {
    accent: '#0ea5e9',
    accent2: '#7dd3fc',
    particles: ['#0ea5e9', '#7dd3fc', '#0c4a6e', '#ffffff'],
    intensity: 0.7,
    rays: 8,
    shake: 5,
    tagline: 'İZ SÜRÜLDÜ',
  },
  gizemli: {
    // Kullanıcı tercihi: Gizemli kategorisi YEŞİL (özel/zor kategori kimliği).
    accent: '#10b981',
    accent2: '#6ee7b7',
    particles: ['#10b981', '#6ee7b7', '#047857', '#ffffff'],
    intensity: 1,
    rays: 16,
    shake: 7,
    tagline: 'USTALIK TANINDI',
  },
};

/** Kategori bilinmiyorsa (veya rozet kategorisiz) kullanılan nötr profil. */
export const FALLBACK_REVEAL_THEME: CategoryRevealTheme = {
  accent: '#9333ea',
  accent2: '#c084fc',
  particles: ['#9333ea', '#c084fc', '#7e22ce', '#ffffff'],
  intensity: 0.6,
  rays: 8,
  shake: 3,
  tagline: 'YENİ KARAKTER',
};

/** Kategori anahtarından açılış profilini güvenle getirir. */
export function categoryRevealTheme(categoryKey?: string | null): CategoryRevealTheme {
  if (!categoryKey) return FALLBACK_REVEAL_THEME;
  return CATEGORY_REVEAL_THEMES[categoryKey] ?? FALLBACK_REVEAL_THEME;
}

/**
 * EFSANEVİ (özel yakalayış) — kategori temasının ÜSTÜNE binen ekstra katman.
 * Her kategoride bulunmaz: hangi rozetlerin efsanevi sayılacağı `LEGENDARY_BADGE_IDS`
 * ile belirlenir (kullanıcı listesi buraya girer). Liste boşsa hiçbir rozet efsanevi olmaz.
 */
export const LEGENDARY_OVERLAY = {
  label: 'EFSANEVİ',
  /**
   * RENK YOK — bilinçli. Efsanevilik rengi DEĞİŞTİRMEZ (gizemli rozet yeşil kalır,
   * sarıya dönmez); yalnızca sahnenin YOĞUNLUĞUNU artırır ve UI'da ayrı bir görsel
   * dil kullanılır: taç ikonu + nabız gibi atan etiket + rozet çevresinde dönen
   * kesikli halka. Böylece "efsanevi" olduğu net anlaşılır ama kategori kimliği bozulmaz.
   */
  intensityBoost: 0.25,
  extraRays: 6,
  extraShake: 3,
} as const;

/**
 * NADİR (5000 P) katmanı — efsanevi kadar görkemli değil ama sıradan da değil.
 * Kategori renginin üstüne hafif bir parlaklık/huzme artışı ekler.
 */
export const RARE_OVERLAY = {
  label: 'NADİR',
  intensityBoost: 0.1,
  extraRays: 3,
  extraShake: 1,
} as const;

/**
 * Bu rozet efsanevi mi — TEK DOĞRULUK KAYNAĞI PUANDIR (10000 P = Efsanevi).
 * Kademe `lib/character-reveal-texts.ts` içindeki `points` alanından türetilir;
 * ayrı bir liste tutulmaz (iki yerde senkron tutma derdi olmasın).
 */
export function isLegendaryBadge(badgeId?: string | null): boolean {
  return badgeTier(badgeId) === 'legendary';
}

/** Rozetin kademesi: 'legendary' (10000) | 'rare' (5000) | 'common' (2500) | null (metni yok). */
export function badgeTier(badgeId?: string | null): 'legendary' | 'rare' | 'common' | null {
  return getCharacterTier(badgeId);
}
