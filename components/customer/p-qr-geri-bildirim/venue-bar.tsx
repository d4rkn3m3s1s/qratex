'use client';

/**
 * Odaklı üst çubuk — pazarlama header'ı yerine: işletme logosu + adı (marka güveni, rapor
 * envanter #7), masa/şube, dil düğmesi (global AppLocaleProvider: header/`<html lang>`
 * birlikte değişir — Bulgu 12), adım göstergesi.
 */
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FunnelCopy } from './copy';

export function VenueMark({ name, logoUrl, size = 'md' }: { name: string; logoUrl: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-10 w-10 text-base';
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bayi logosu harici/R2 URL'si; next/image alan adı listesine bağlı kalmasın
      <img
        src={logoUrl}
        alt=""
        width={size === 'lg' ? 64 : 40}
        height={size === 'lg' ? 64 : 40}
        className={cn(box, 'shrink-0 rounded-control border border-subtle bg-surface-2 object-cover')}
        decoding="async"
      />
    );
  }
  const initial = name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  return (
    <span
      aria-hidden
      className={cn(box, 'inline-flex shrink-0 items-center justify-center rounded-control bg-brand-subtle font-semibold text-brand')}
    >
      {initial}
    </span>
  );
}

export type StepIndex = 0 | 1 | 2;

export function VenueBar({
  name,
  logoUrl,
  subtitle,
  step,
  copy,
  onToggleLocale,
}: {
  name: string;
  logoUrl: string | null;
  subtitle: string | null;
  step: StepIndex;
  copy: FunnelCopy;
  onToggleLocale: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-surface-1 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 py-2.5">
        <VenueMark name={name} logoUrl={logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="qx-body truncate font-semibold text-fg">{name}</p>
          {subtitle && <p className="qx-caption truncate text-fg-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onToggleLocale}
          aria-label={copy.langToggleLabel}
          className={cn(
            'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-3',
            'qx-small font-semibold text-fg-muted transition-colors duration-fast ease-standard hover:bg-surface-3 hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
        >
          <Languages aria-hidden className="h-4 w-4" />
          <span>{copy.langToggleShort}</span>
        </button>
      </div>
      <div className="mx-auto w-full max-w-lg px-4 pb-2">
        <ol className="flex items-center gap-1.5" aria-label={copy.stepLabel(step + 1, 3)}>
          {copy.stepNames.map((label, i) => (
            <li key={label} className="flex-1" aria-current={i === step ? 'step' : undefined}>
              <span className="sr-only">
                {label}
                {i === step ? ` — ${copy.stepLabel(i + 1, 3)}` : ''}
              </span>
              <span
                aria-hidden
                className={cn(
                  'block h-1 rounded-full transition-colors duration-base ease-standard',
                  i <= step ? 'bg-brand' : 'bg-surface-3'
                )}
              />
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}
