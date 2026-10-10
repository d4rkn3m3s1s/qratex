/**
 * Hareket politikası — TEK tercih kaynağı.
 *
 *   azalt = OS `prefers-reduced-motion: reduce`  VEYA  uygulama ayarı
 *           (`<html class="reduce-animations">`, lib/accessibility-prefs.ts)
 *
 * Bu kaynak framer-motion (`MotionPolicyConfig`), canvas/three.js/rAF arka
 * planları, konfeti, oyun sarsıntısı, ses/titreşim ve video otomatik
 * oynatmayı besler. React dışı kod `isReducedMotion()` / `subscribeReducedMotion()`
 * kullanır; React kodu `useReducedMotionPref()` / `useMotionPolicy()`.
 *
 * DOM'a doğrudan dokunmaz; testlerde sahte `window`/`document` verilebilir.
 */

export const REDUCE_MOTION_CLASS = 'reduce-animations';
export const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type MinimalMediaQueryList = {
  matches: boolean;
  addEventListener?: (type: 'change', cb: () => void) => void;
  removeEventListener?: (type: 'change', cb: () => void) => void;
  addListener?: (cb: () => void) => void;
  removeListener?: (cb: () => void) => void;
};

export type MotionEnv = {
  matchMedia?: (query: string) => MinimalMediaQueryList;
  root?: { classList: { contains: (c: string) => boolean } } | null;
  MutationObserver?: new (cb: () => void) => {
    observe(target: object, opts: { attributes: boolean; attributeFilter: string[] }): void;
    disconnect(): void;
  };
};

function defaultEnv(): MotionEnv {
  if (typeof window === 'undefined' || typeof document === 'undefined') return {};
  return {
    matchMedia: typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined,
    root: document.documentElement,
    MutationObserver: typeof window.MutationObserver === 'function' ? window.MutationObserver : undefined,
  };
}

/** OS tercihi açık mı? */
export function prefersReducedMotionOS(env: MotionEnv = defaultEnv()): boolean {
  try {
    return !!env.matchMedia?.(REDUCE_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** Uygulama içi "Animasyonları azalt" ayarı açık mı? */
export function prefersReducedMotionApp(env: MotionEnv = defaultEnv()): boolean {
  try {
    return !!env.root?.classList.contains(REDUCE_MOTION_CLASS);
  } catch {
    return false;
  }
}

/**
 * Hareket azaltılmalı mı? (OS VEYA uygulama ayarı). Sunucuda `false`.
 * An Motoru `lib/moments/effects.ts → prefersReducedMotion()` bu fonksiyonu
 * çağırmalıdır (iki ayrı uygulama olmaz — yol haritası §5.3).
 */
export function isReducedMotion(env: MotionEnv = defaultEnv()): boolean {
  return prefersReducedMotionOS(env) || prefersReducedMotionApp(env);
}

/**
 * Tercih değişimine abone olur (OS medya sorgusu + `<html>` sınıf değişimi).
 * Dönüş: aboneliği kaldıran fonksiyon.
 */
export function subscribeReducedMotion(onChange: () => void, env: MotionEnv = defaultEnv()): () => void {
  const cleanups: Array<() => void> = [];

  try {
    const mql = env.matchMedia?.(REDUCE_MOTION_QUERY);
    if (mql) {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        cleanups.push(() => mql.removeEventListener?.('change', onChange));
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(onChange);
        cleanups.push(() => mql.removeListener?.(onChange));
      }
    }
  } catch {
    /* medya sorgusu yoksa yalnız sınıfı izle */
  }

  if (env.root && env.MutationObserver) {
    try {
      const observer = new env.MutationObserver(onChange);
      observer.observe(env.root, { attributes: true, attributeFilter: ['class'] });
      cleanups.push(() => observer.disconnect());
    } catch {
      /* gözlemci kurulamazsa sessizce geç */
    }
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}
