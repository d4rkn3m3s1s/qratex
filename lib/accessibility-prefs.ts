/**
 * Erişilebilirlik tercihleri (renk körü modu, yüksek kontrast, animasyon azaltma).
 * localStorage'da saklanır ve <html>'e sınıf olarak uygulanır — tema sistemiyle aynı
 * desen. DB'ye de yazılır (kalıcılık) ama anında uygulama localStorage ile olur,
 * round-trip beklemeden.
 *
 * Önceden highContrast/reduceAnimations yalnızca DB'ye yazılıp hiç uygulanmıyordu;
 * bu modül üçünü de gerçekten çalışır hale getirir.
 */
/** Yazı boyutu ölçeği: kök `font-size` (rem tabanlı tüm tipografi birlikte büyür). */
export type TextScalePref = 'default' | 'lg' | 'xl';

export interface AccessibilityPrefs {
  colorblindMode: boolean;
  highContrast: boolean;
  reduceAnimations: boolean;
  /**
   * İsteğe bağlı (geriye uyum): verilmezse cihazda saklı değer korunur. Sınıflar
   * `text-scale-lg` / `text-scale-xl` (app/globals.css).
   */
  textScale?: TextScalePref;
}

export const ACCESSIBILITY_STORAGE_KEY = 'qratex-a11y';

const TEXT_SCALE_CLASSES: Record<Exclude<TextScalePref, 'default'>, string> = {
  lg: 'text-scale-lg',
  xl: 'text-scale-xl',
};

function normalizeTextScale(v: unknown): TextScalePref {
  return v === 'lg' || v === 'xl' ? v : 'default';
}

const CLASS_MAP: Record<'colorblindMode' | 'highContrast' | 'reduceAnimations', string> = {
  colorblindMode: 'colorblind',
  highContrast: 'high-contrast',
  reduceAnimations: 'reduce-animations',
};

export function readAccessibilityPrefs(): AccessibilityPrefs {
  const fallback: AccessibilityPrefs = {
    colorblindMode: false,
    highContrast: false,
    reduceAnimations: false,
    textScale: 'default',
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
      textScale: normalizeTextScale(parsed.textScale),
    };
  } catch {
    return fallback;
  }
}

/** Tercihleri <html> sınıflarına uygular ve localStorage'a yazar. */
export function applyAccessibilityPrefs(prefs: AccessibilityPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  (Object.keys(CLASS_MAP) as (keyof typeof CLASS_MAP)[]).forEach((key) => {
    root.classList.toggle(CLASS_MAP[key], !!prefs[key]);
  });
  // textScale verilmediyse (eski çağıranlar) cihazdaki değer korunur.
  const textScale = prefs.textScale === undefined ? readAccessibilityPrefs().textScale ?? 'default' : normalizeTextScale(prefs.textScale);
  (Object.keys(TEXT_SCALE_CLASSES) as (keyof typeof TEXT_SCALE_CLASSES)[]).forEach((key) => {
    root.classList.toggle(TEXT_SCALE_CLASSES[key], textScale === key);
  });
  try {
    window.localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify({ ...prefs, textScale }));
  } catch {
    /* localStorage kullanılamıyorsa sessizce geç */
  }
}
