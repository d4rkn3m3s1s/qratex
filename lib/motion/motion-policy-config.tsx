'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useReducedMotionPref } from './use-reduced-motion-pref';

/**
 * framer-motion'u tek hareket politikasına bağlar.
 * Eski `MotionConfig reducedMotion="user"` yalnız OS tercihini okuyordu;
 * uygulama içi "Animasyonları azalt" ayarı 146 framer dosyasına ulaşmıyordu.
 * Burada OS VEYA uygulama ayarı → `always` (transform/layout animasyonları kapalı).
 */
export function MotionPolicyConfig({ children }: { children: ReactNode }) {
  const reduce = useReducedMotionPref();
  return <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>{children}</MotionConfig>;
}
