/**
 * QDL ton sistemi — sayfalar renk değil ANLAM seçer (`tone`), sınıf burada üretilir.
 * Tüm tonlar rol token'larına bağlıdır; tema preset'leri, renk körü ve yüksek
 * kontrast modları otomatik uygulanır.
 */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/** İkon çipi / rozet: açık zemin + AA metin + ince kenarlık. */
export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-fg-muted ring-1 ring-inset ring-border',
  brand: 'bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border',
  success: 'bg-success-subtle text-success ring-1 ring-inset ring-success-border',
  warning: 'bg-warning-subtle text-warning ring-1 ring-inset ring-warning-border',
  danger: 'bg-danger-subtle text-danger ring-1 ring-inset ring-danger-border',
  info: 'bg-info-subtle text-info ring-1 ring-inset ring-info-border',
};

/** Yalnız metin rengi (zemin üstü, ≥ 4.5:1). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

/** Bölüm/kart sol vurgu şeridi (dekoratif). */
export const TONE_STRIPE: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/** Uyarı/bilgi bandı: açık zemin + kenarlık + AA metin. */
export const TONE_CALLOUT: Record<Tone, string> = {
  neutral: 'border-border bg-surface-muted text-fg',
  brand: 'border-brand-border bg-brand-subtle text-fg',
  success: 'border-success-border bg-success-subtle text-fg',
  warning: 'border-warning-border bg-warning-subtle text-fg',
  danger: 'border-danger-border bg-danger-subtle text-fg',
  info: 'border-info-border bg-info-subtle text-fg',
};
