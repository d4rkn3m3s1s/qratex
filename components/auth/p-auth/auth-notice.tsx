'use client';

import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CALLOUT, TONE_TEXT } from '@/components/states';

/**
 * Kimlik ekranlarının KALICI durum bandı (toast değil): hata kodu, doğrulama bekleniyor,
 * "e-postan doğrulandı" vb. Ekran okuyucuya hata `alert`, diğerleri `status` olarak duyurulur.
 * Yalnız renge dayanmaz (ikon + başlık + metin); QDL ton token'larıyla her temada AA kontrast.
 */
export function AuthNotice({
  tone,
  title,
  children,
  action,
  className,
  id,
}: {
  tone: 'danger' | 'warning' | 'info' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  const Icon = tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      id={id}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className={cn('flex items-start gap-3 rounded-control border px-4 py-3 text-left', TONE_CALLOUT[tone], className)}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT[tone])} aria-hidden />
      <div className="qx-small min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold text-fg">{title}</p> : null}
        {children ? <div className="text-fg-muted text-pretty">{children}</div> : null}
        {action ? <div className="pt-1.5">{action}</div> : null}
      </div>
    </div>
  );
}
