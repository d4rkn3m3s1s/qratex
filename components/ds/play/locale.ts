'use client';

import { useDsLocale } from '../a11y/copy';
import type { PlayLocale } from './shared';

/**
 * play bileşenlerinin dili: `locale` prop'u verilirse o, yoksa uygulama dili
 * (`AppLocaleProvider`; sağlayıcı yoksa `tr`). Diğer DS katmanlarıyla aynı kaynak.
 * Kanca koşulsuz çağrılır.
 */
export function usePlayLocale(explicit?: PlayLocale): PlayLocale {
  const app = useDsLocale();
  return explicit ?? app;
}
