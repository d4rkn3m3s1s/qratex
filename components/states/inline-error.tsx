'use client';

import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStateCopy } from './copy';
import { TONE_CALLOUT, TONE_TEXT } from './tone';

export type InlineErrorProps = {
  children?: ReactNode;
  /**
   * `field`: form alanı altındaki tek satır (Input `errorId` ile bağlanır).
   * `banner`: bölüm üstü bant (ör. "son veriler gösteriliyor").
   */
  variant?: 'field' | 'banner';
  /** `danger` (varsayılan) | `warning` (bayat veri) | `info`. */
  tone?: 'danger' | 'warning' | 'info';
  /** Input'un `aria-describedby`'ına verilecek id. */
  id?: string;
  onRetry?: () => unknown;
  className?: string;
};

/**
 * Satır içi hata — form alanı ve bölüm bandı için. Her temada ≥ 4.5:1
 * (`text-danger` → `--danger-text`). Yalnız renge dayanmaz: ikon + metin.
 *
 *   <Input error={!!err} errorId="email-error" … />
 *   <InlineError id="email-error">{err}</InlineError>
 */
export function InlineError({ children, variant = 'field', tone = 'danger', id, onRetry, className }: InlineErrorProps) {
  const copy = useStateCopy();
  if (children == null || children === false || children === '') return null;
  const Icon = tone === 'warning' ? AlertTriangle : tone === 'info' ? Info : AlertCircle;

  if (variant === 'field') {
    return (
      <p id={id} role="alert" className={cn('qx-small mt-1.5 flex items-start gap-1.5', TONE_TEXT[tone], className)}>
        <Icon className="mt-[0.15rem] h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{children}</span>
      </p>
    );
  }

  return (
    <div
      id={id}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-control border px-4 py-3', TONE_CALLOUT[tone], className)}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT[tone])} aria-hidden />
      <div className="qx-small min-w-0 flex-1">{children}</div>
      {onRetry && (
        <button
          type="button"
          onClick={() => void onRetry()}
          className={cn(
            'qx-small inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-chip px-2.5 font-medium underline-offset-4 hover:underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            TONE_TEXT[tone],
          )}
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          {copy.retry}
        </button>
      )}
    </div>
  );
}
