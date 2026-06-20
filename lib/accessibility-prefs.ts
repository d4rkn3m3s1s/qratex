/**
 * Erişilebilirlik tercihleri (renk körü modu, yüksek kontrast, animasyon azaltma).
 * localStorage'da saklanır ve <html>'e sınıf olarak uygulanır — tema sistemiyle aynı
 * desen. DB'ye de yazılır (kalıcılık) ama anında uygulama localStorage ile olur,
 * round-trip beklemeden.
 *
 * Önceden highContrast/reduceAnimations yalnızca DB'ye yazılıp hiç uygulanmıyordu;
 * bu modül üçünü de gerçekten çalışır hale getirir.
 */
export interface AccessibilityPrefs {
  colorblindMode: boolean;
  highContrast: boolean;
  reduceAnimations: boolean;
}

export const ACCESSIBILITY_STORAGE_KEY = 'qratex-a11y';

const CLASS_MAP: Record<keyof AccessibilityPrefs, string> = {
  colorblindMode: 'colorblind',
  highContrast: 'high-contrast',
  reduceAnimations: 'reduce-animations',
};

export function readAccessibilityPrefs(): AccessibilityPrefs {
  const fallback: AccessibilityPrefs = {
    colorblindMode: false,
    highContrast: false,
    reduceAnimations: false,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AccessibilityPrefs>;
    return {
      colorblindMode: !!parsed.colorblindMode,
      highContrast: !!parsed.highContrast,
      reduceAnimations: !!parsed.reduceAnimations,
    };
  } catch {
    return fallback;
  }
}

/** Tercihleri <html> sınıflarına uygular ve localStorage'a yazar. */
export function applyAccessibilityPrefs(prefs: AccessibilityPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  (Object.keys(CLASS_MAP) as (keyof AccessibilityPrefs)[]).forEach((key) => {
    root.classList.toggle(CLASS_MAP[key], !!prefs[key]);
  });
  try {
    window.localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage kullanılamıyorsa sessizce geç */
  }
}
