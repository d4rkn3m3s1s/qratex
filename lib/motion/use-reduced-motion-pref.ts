'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Transition, Variants } from 'framer-motion';
import { isReducedMotion, subscribeReducedMotion } from './policy';
import { toReducedVariants } from './variants';

const subscribe = (onChange: () => void) => subscribeReducedMotion(onChange);
const getSnapshot = () => isReducedMotion();
/** SSR ve hidrasyonun ilk karesi: hareket açık varsayılır (CSS zaten OS tercihini uygular). */
const getServerSnapshot = () => false;

/**
 * Hareket azaltılmalı mı? OS `prefers-reduced-motion` VEYA uygulama ayarı
 * (`html.reduce-animations`). İkisindeki değişimde canlı güncellenir.
 *
 * framer'ın `useReducedMotion()`'ı YALNIZ OS tercihini okur; bu kancayı kullanın.
 */
export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type MotionPolicy = {
  /** Hareket azaltılmalı (OS veya uygulama ayarı). */
  reduce: boolean;
  /** Sonsuz/dekoratif döngüler (`<Ambient>`) çalışabilir mi? */
  allowAmbient: boolean;
  /** Kutlama (konfeti, sarsıntı, titreşim, ses) çalabilir mi? Azaltılmışta yalnız statik özet. */
  allowCelebrate: boolean;
  /** Video otomatik oynatılabilir mi? */
  allowAutoplay: boolean;
  /** Varyantı politikaya göre döndürür (azaltılmışta statik kopya). */
  variants: (v: Variants) => Variants;
  /** Geçişi politikaya göre döndürür (azaltılmışta süre 0). */
  transition: (t: Transition) => Transition;
};

/**
 * Tek motion politikası — yol haritası §4.2 `useMotionPolicy()`.
 * FX katmanı, konfeti, oyun sarsıntısı, ses/titreşim ve video bu kancadan beslenir.
 */
export function useMotionPolicy(): MotionPolicy {
  const reduce = useReducedMotionPref();
  const variants = useCallback((v: Variants) => (reduce ? toReducedVariants(v) : v), [reduce]);
  const transition = useCallback((t: Transition) => (reduce ? { ...t, duration: 0, delay: 0 } : t), [reduce]);
  return useMemo(
    () => ({
      reduce,
      allowAmbient: !reduce,
      allowCelebrate: !reduce,
      allowAutoplay: !reduce,
      variants,
      transition,
    }),
    [reduce, variants, transition],
  );
}
