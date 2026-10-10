/** Oyna merkezi ortak sınıfları (QDL token'ları; ham palet yok, dokunma hedefi ≥ 44px). */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const CTA_CLASS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 qx-small font-semibold ' +
  'bg-brand text-brand-fg qx-elevation-1 transition-[filter,transform] duration-fast ease-standard hover:brightness-110 active:scale-[0.98] ' +
  FOCUS;

export const CTA_SECONDARY_CLASS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 qx-small font-semibold ' +
  'bg-surface-2 text-fg ring-1 ring-inset ring-border transition-colors duration-fast ease-standard hover:bg-surface-3 ' +
  FOCUS;

export const CHIP_CLASS =
  'inline-flex h-7 items-center gap-1 rounded-chip bg-surface-2 px-2.5 qx-caption font-medium text-fg-muted ring-1 ring-inset ring-border';

export const SECTION_CLASS = 'rounded-card border border-border bg-surface-1 p-card qx-elevation-1';
