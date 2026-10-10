'use client';

import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, WifiOff, Lock, PackageX, SearchX, RotateCw } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fadeUp } from '@/lib/motion/variants';
import { useStateCopy, type StateCopy } from './copy';
import { TONE_CHIP, type Tone } from './tone';
import type { ErrorKind } from './query-state-logic';

const KIND_META: Record<ErrorKind, { icon: LucideIcon; tone: Tone; title: keyof StateCopy; body: keyof StateCopy; retryable: boolean }> = {
  generic: { icon: AlertTriangle, tone: 'danger', title: 'errorTitle', body: 'errorBody', retryable: true },
  offline: { icon: WifiOff, tone: 'warning', title: 'offlineTitle', body: 'offlineBody', retryable: true },
  forbidden: { icon: Lock, tone: 'warning', title: 'forbiddenTitle', body: 'forbiddenBody', retryable: false },
  moduleDisabled: { icon: PackageX, tone: 'neutral', title: 'moduleDisabledTitle', body: 'moduleDisabledBody', retryable: false },
  notFound: { icon: SearchX, tone: 'neutral', title: 'notFoundTitle', body: 'notFoundBody', retryable: false },
};

export type ErrorStateProps = {
  kind?: ErrorKind;
  /** `section`: kart/bölüm içi; `page`: sayfanın tamamı (error.tsx). */
  variant?: 'section' | 'page';
  title?: ReactNode;
  description?: ReactNode;
  /** Verilirse "Tekrar dene" butonu (Promise dönerse bekleme durumu gösterilir). */
  onRetry?: () => unknown;
  /** Sentry/Next `error.digest` — destek için gösterilir. */
  digest?: string;
  /** Ek aksiyon (ör. "Ana sayfaya dön"). */
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  headingLevel?: 'h1' | 'h2' | 'h3' | 'p';
};

/**
 * Hata durumu — boş durumdan GÖRSEL olarak ayrışır ve yeniden deneme sunar.
 * `role="alert"` ile duyurulur. `<main>` açmaz (panel layout'unda zaten var).
 */
export function ErrorState({
  kind = 'generic',
  variant = 'section',
  title,
  description,
  onRetry,
  digest,
  action,
  icon,
  className,
  headingLevel,
}: ErrorStateProps) {
  const copy = useStateCopy();
  const meta = KIND_META[kind];
  const Icon = icon ?? meta.icon;
  const [retrying, setRetrying] = useState(false);
  const Heading = headingLevel ?? (variant === 'page' ? 'h1' : 'h3');

  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Motion.section
      role="alert"
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={cn(
        'mx-auto flex w-full flex-col items-center text-center',
        variant === 'page' ? 'max-w-lg gap-4 px-6 py-16' : 'max-w-md gap-3 px-4 py-10',
        className,
      )}
    >
      <div
        className={cn('grid place-items-center rounded-card', TONE_CHIP[meta.tone], variant === 'page' ? 'h-16 w-16' : 'h-12 w-12')}
        aria-hidden
      >
        <Icon className={variant === 'page' ? 'h-8 w-8' : 'h-6 w-6'} strokeWidth={1.75} />
      </div>
      <div className="space-y-1.5">
        <Heading className={cn('font-semibold text-fg', variant === 'page' ? 'qx-h2' : 'qx-h3')}>
          {title ?? (copy[meta.title] as string)}
        </Heading>
        <p className="qx-body text-fg-muted">{description ?? (copy[meta.body] as string)}</p>
      </div>
      {((onRetry && meta.retryable) || action) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry && meta.retryable && (
            <Button type="button" variant="outline" onClick={handleRetry} loading={retrying} aria-busy={retrying || undefined}>
              {!retrying && <RotateCw className="h-4 w-4" aria-hidden />}
              {retrying ? copy.retrying : copy.retry}
            </Button>
          )}
          {action}
        </div>
      )}
      {digest && (
        <p className="qx-caption text-fg-subtle">
          {copy.errorCode}: <code className="font-mono">{digest}</code>
        </p>
      )}
    </Motion.section>
  );
}
