'use client';

import { useEffect } from 'react';
import { applyAccessibilityPrefs, readAccessibilityPrefs } from '@/lib/accessibility-prefs';

/**
 * localStorage'daki erişilebilirlik tercihlerini mount'ta <html>'e uygular.
 * Tema sistemindeki ThemeModeSync ile aynı desen. FOUC'u önlemek için layout'taki
 * init script de aynı sınıfları erkenden ekler.
 */
export function AccessibilityClassSync() {
  useEffect(() => {
    applyAccessibilityPrefs(readAccessibilityPrefs());
  }, []);
  return null;
}
