/**
 * QDL motion token'ları — TEK kaynak.
 * CSS eşlenikleri `app/globals.css` → `--motion-*`, `--ease-*` (aynı değerler;
 * `__tests__/design/motion.test.ts` ikisinin senkron kaldığını doğrular).
 *
 * İlke: hareket durum değişikliğini anlatır, dekor değildir.
 */

/** Saniye cinsinden süreler (framer-motion `transition.duration`). */
export const DURATION = {
  /** hover, press, toggle */
  fast: 0.12,
  /** sheet, dialog, popover, sekme */
  base: 0.2,
  /** sayfa içi geçiş, liste girişi */
  slow: 0.32,
  /** puan kapsülü / küçük kutlama — atlanabilir olmalı, en fazla 1,2 sn */
  celebrate: 1.2,
  /** An Motoru tam ekran sahnesi — Esc/dokunuşla geçilir, en fazla 4,5 sn */
  moment: 4.5,
} as const;

export type DurationToken = keyof typeof DURATION;

/** Milisaniye (CSS, setTimeout, rAF tween). */
export const DURATION_MS: Record<DurationToken, number> = {
  fast: 120,
  base: 200,
  slow: 320,
  celebrate: 1200,
  moment: 4500,
};

/** cubic-bezier eğrileri. */
export const EASE = {
  /** genel amaçlı */
  standard: [0.2, 0, 0, 1] as [number, number, number, number],
  /** giriş (yumuşak iniş) */
  emphasized: [0.22, 1, 0.36, 1] as [number, number, number, number],
  /** çıkış (hızlanarak ayrılır) */
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
} as const;

export type EaseToken = keyof typeof EASE;

/** CSS karşılıkları (inline style / keyframe için). */
export const EASE_CSS: Record<EaseToken, string> = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.22, 1, 0.36, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
};

/**
 * Spring ön ayarları. Operasyon yüzeylerinde yalnız `snappy`/`gentle`;
 * `bouncy` yalnız play kaydında (ödül, rozet, oyun).
 */
export const SPRING = {
  snappy: { type: 'spring' as const, stiffness: 400, damping: 30, mass: 1 },
  gentle: { type: 'spring' as const, stiffness: 200, damping: 24, mass: 1 },
  bouncy: { type: 'spring' as const, stiffness: 320, damping: 18, mass: 0.9 },
} as const;

export type SpringToken = keyof typeof SPRING;

/** Giriş ofsetleri (px). Tek değer: 8. Büyük sahneler `moment`'e aittir. */
export const OFFSET = {
  enter: 8,
  sheet: 24,
} as const;

/** Etkileşim ölçekleri — hover'da ölçek YOK (düzen kayması), yalnız kaldırma. */
export const INTERACTION = {
  hoverLiftY: -2,
  pressScale: 0.98,
} as const;

/**
 * Stagger bütçesi: toplam gecikme ≤ 0,6 sn, en fazla ilk 12 öğe kademeli girer;
 * sonrakiler beklemeden gelir. Yoğun tablolarda stagger kullanılmaz.
 */
export const STAGGER = {
  step: 0.04,
  maxItems: 12,
  maxTotal: 0.6,
} as const;
