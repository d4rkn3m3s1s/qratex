'use client';

import type { ReactNode } from 'react';
import { Cookie } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useAppLocale } from '@/lib/app-locale';
import { useConsent } from '@/lib/consent/client';
import { cn } from '@/lib/utils';
import { getConsentCopy } from './consent-copy';
import { openConsentCenter } from './consent-center';
import type { ConsentSurface } from './consent-record';

/** Footer ve diğer yüzeyler için "Çerez tercihleri" bağlantısı/butonu (tercih merkezini açar). */
export function ConsentPreferencesButton({
  surface,
  variant = 'link',
  className,
  children,
  showIcon = false,
}: {
  surface: ConsentSurface;
  variant?: 'link' | ButtonProps['variant'];
  className?: string;
  children?: ReactNode;
  showIcon?: boolean;
}) {
  const { locale } = useAppLocale();
  const copy = getConsentCopy(locale);
  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={() => openConsentCenter(surface)}
        className={cn('text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline', className)}
      >
        {children ?? copy.preferencesButton}
      </button>
    );
  }
  return (
    <Button type="button" variant={variant} className={cn('gap-2', className)} onClick={() => openConsentCenter(surface)}>
      {showIcon ? <Cookie className="h-4 w-4" aria-hidden /> : null}
      {children ?? copy.preferencesButton}
    </Button>
  );
}

/** Mevcut kararın özeti + "Tercihleri yönet" (Çerez Politikası ve Ayarlar › Gizlilik). */
export function ConsentSummaryCard({ surface, className }: { surface: ConsentSurface; className?: string }) {
  const { locale } = useAppLocale();
  const copy = getConsentCopy(locale);
  const consent = useConsent();
  const rows: Array<{ label: string; on: boolean; locked?: boolean }> = [
    { label: copy.necessaryTitle, on: true, locked: true },
    { label: copy.analyticsTitle, on: consent.categories.analytics },
    { label: copy.replayTitle, on: consent.categories.replay },
  ];
  const decidedAt = consent.decided && consent.state ? new Date(consent.state.decidedAt) : null;
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4 sm:p-5', className)} aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <ul className="flex flex-wrap gap-2" aria-label={copy.centerTitle}>
            {rows.map((r) => (
              <li
                key={r.label}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                  r.on ? 'bg-success-subtle text-success ring-success-border' : 'bg-surface-muted text-fg-muted ring-border'
                )}
              >
                <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', r.on ? 'bg-success' : 'bg-fg-subtle')} />
                {r.label}: {r.locked ? copy.alwaysOn : copy.status(r.on)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">
            {!consent.ready
              ? '…'
              : decidedAt
                ? copy.lastDecision(
                    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { dateStyle: 'long' }).format(decidedAt)
                  )
                : copy.noDecision}
          </p>
        </div>
        <ConsentPreferencesButton surface={surface} variant="outline" showIcon className="min-h-10 shrink-0">
          {copy.manage}
        </ConsentPreferencesButton>
      </div>
    </div>
  );
}
