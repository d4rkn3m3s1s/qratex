/**
 * QDL framer-motion varyant ön ayarları. Sayfalar kendi `initial/animate`
 * değerlerini UYDURMAZ; buradan seçer.
 *
 * Kullanım (global LazyMotion → `m` bileşenleri):
 *   import { m as Motion } from 'framer-motion';
 *   import { fadeUp } from '@/lib/motion';
 *   <Motion.div variants={fadeUp} initial="hidden" animate="visible" exit="exit" />
 *
 * Azaltılmış harekette `MotionPolicyConfig` (reducedMotion="always") transform'u
 * zaten kapatır; opaklık geçişleri kısa kalır. Tamamen statik istenirse
 * `useMotionPolicy().variants(fadeUp)` opaklık-dışı her şeyi siler.
 */
import type { Transition, Variants } from 'framer-motion';
import { DURATION, EASE, INTERACTION, OFFSET, SPRING, STAGGER } from './tokens';

const enterTransition: Transition = { duration: DURATION.slow, ease: EASE.emphasized };
const exitTransition: Transition = { duration: DURATION.fast, ease: EASE.exit };

/** Aşağıdan 8px yükselerek belirme — kart, bölüm, liste satırı. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: OFFSET.enter },
  visible: { opacity: 1, y: 0, transition: enterTransition },
  exit: { opacity: 0, y: OFFSET.enter / 2, transition: exitTransition },
};

/** Yalnız opaklık — metin değişimi, durum geçişi. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit: { opacity: 0, transition: exitTransition },
};

/** 0.96 → 1 ölçek — popover, kart açılışı, rozet önizleme. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: DURATION.base, ease: EASE.emphasized } },
  exit: { opacity: 0, scale: 0.98, transition: exitTransition },
};

/** Play kaydı: yaylı belirme (ödül, rozet, kutlama). Operasyon yüzeyinde kullanma. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: SPRING.bouncy },
  exit: { opacity: 0, scale: 0.95, transition: exitTransition },
};

/** Arka plan örtüsü (dialog/sheet scrim). */
export const overlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.exit } },
};

export type SheetSide = 'bottom' | 'right' | 'left' | 'top';

/** Kenardan kayan panel (mobil alt sayfa, sağ detay paneli). */
export function sheet(side: SheetSide = 'bottom'): Variants {
  const horizontal = side === 'left' || side === 'right';
  const offset = `${side === 'left' || side === 'top' ? -100 : 100}%`;
  const from = horizontal ? { x: offset } : { y: offset };
  const to = horizontal ? { x: 0 } : { y: 0 };
  return {
    hidden: { opacity: 1, ...from },
    visible: { opacity: 1, ...to, transition: { duration: DURATION.base, ease: EASE.emphasized } },
    exit: { opacity: 1, ...from, transition: { duration: DURATION.base, ease: EASE.exit } },
  };
}

/** Önceden hesaplanmış alt sayfa (en sık kullanılan). */
export const sheetBottom: Variants = sheet('bottom');

/**
 * Stagger bütçesi: i. öğenin gecikmesi (sn). İlk 12 öğe kademeli,
 * toplam ≤ 0,6 sn; sonrakiler `maxTotal`'da sabitlenir (40 öğeli listede
 * son öğe 4 sn beklemez).
 */
export function staggerDelay(index: number, step: number = STAGGER.step): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  const capped = Math.min(index, STAGGER.maxItems - 1);
  return Math.min(capped * step, STAGGER.maxTotal);
}

/** Liste kabı: çocuklarını bütçeli kademeyle sahneler. */
export function stagger(step: number = STAGGER.step, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: step, delayChildren } },
    exit: {},
  };
}

/** Varsayılan liste kabı. */
export const listContainer: Variants = stagger();

/**
 * Liste öğesi. Kap `listContainer` ise gecikmeyi kap yönetir; tek başına
 * kullanılırken `custom={index}` verilirse bütçeli gecikme uygulanır.
 */
export const listItem: Variants = {
  hidden: { opacity: 0, y: OFFSET.enter },
  visible: (index: number | undefined) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.slow,
      ease: EASE.emphasized,
      delay: typeof index === 'number' ? staggerDelay(index) : 0,
    },
  }),
  exit: { opacity: 0, transition: exitTransition },
};

/** Hover/press etkileşimleri — ölçek yok, 2px kaldırma; basışta 0.98. */
export const interactive = {
  whileHover: { y: INTERACTION.hoverLiftY, transition: { duration: DURATION.fast, ease: EASE.standard } },
  whileTap: { scale: INTERACTION.pressScale, transition: { duration: DURATION.fast, ease: EASE.standard } },
} as const;

/** Sayı sayacı ön ayarı (useNumberTicker). */
export const numberTicker = {
  durationMs: 700,
  ease: EASE.emphasized,
} as const;

/**
 * Varyantı tamamen statik hale getirir: transform/ölçek/konum anahtarlarını
 * siler, yalnız opaklığı ve 0 süreyi bırakır. Azaltılmış hareket için.
 */
const MOTION_KEYS = new Set(['x', 'y', 'z', 'scale', 'scaleX', 'scaleY', 'rotate', 'rotateX', 'rotateY', 'skewX', 'skewY']);

export function toReducedVariants(variants: Variants): Variants {
  const out: Variants = {};
  for (const [key, value] of Object.entries(variants)) {
    if (typeof value === 'function') {
      out[key] = (...args: Parameters<typeof value>) => stripTarget(value(...args) as Record<string, unknown>);
    } else {
      out[key] = stripTarget(value as Record<string, unknown>);
    }
  }
  return out;
}

function stripTarget(target: Record<string, unknown> | undefined) {
  if (!target || typeof target !== 'object') return target as never;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(target)) {
    if (MOTION_KEYS.has(k)) continue;
    if (k === 'transition') continue;
    next[k] = v;
  }
  next.transition = { duration: 0 };
  return next as never;
}
