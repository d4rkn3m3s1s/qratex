import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, type Tone } from '@/components/states/tone';

/**
 * Kimlik ekranlarının TEK kart iskeleti (QDL v2 · ops kaydı).
 *
 * Eskiden yedi sayfa üç farklı iskelet kullanıyordu (shadcn `Card glass`, elle `rounded-card`
 * div, kartsız tam ekran sarmalayıcı); başlıklar `h3`, yerleşim sıçramalıydı. Kural:
 *  - `surface-1` düz yüzey, ince kenarlık, elevation ≤ 1 (cam/glow yok — ops kaydı)
 *  - sayfanın tek `h1`'i kartın başlığıdır (`headingRef` ile sonuç geldiğinde odak taşınır)
 *  - giriş hareketi tek ve CSS'tedir (`qx-enter`, azaltılmış harekette kapalı)
 *  - mobilde tam genişlik, 16px kenar boşluğu kabuktan gelir; kart `max-w-md`
 */
export function AuthCard({
  icon,
  tone = 'brand',
  title,
  description,
  children,
  footer,
  align = 'center',
  headingRef,
  headingId,
  className,
  live,
}: {
  icon?: ReactNode;
  tone?: Tone;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  align?: 'center' | 'start';
  headingRef?: Ref<HTMLHeadingElement>;
  headingId?: string;
  className?: string;
  /** Başlık + açıklama bir durum bildirimi ise ekran okuyucuya duyurulur. */
  live?: 'polite' | 'assertive';
}) {
  const centered = align === 'center';
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'qx-enter w-full max-w-md rounded-card border border-border bg-surface-1 text-fg shadow-sm',
        className,
      )}
    >
      <header
        className={cn('flex flex-col gap-2 px-5 pt-6 sm:px-7 sm:pt-7', centered ? 'items-center text-center' : 'items-start')}
        role={live ? (live === 'assertive' ? 'alert' : 'status') : undefined}
        aria-live={live}
      >
        {icon ? (
          <div className={cn('mb-1 grid h-12 w-12 place-items-center rounded-full', TONE_CHIP[tone])} aria-hidden>
            {icon}
          </div>
        ) : null}
        <h1 ref={headingRef} id={headingId} tabIndex={headingRef ? -1 : undefined} className="qx-h1 text-fg outline-none">
          {title}
        </h1>
        {description ? <div className="qx-body text-fg-muted text-pretty">{description}</div> : null}
      </header>
      {children ? <div className="space-y-5 px-5 pb-6 pt-5 sm:px-7 sm:pb-7">{children}</div> : <div className="pb-6 sm:pb-7" />}
      {footer ? (
        <footer className="flex flex-col items-center gap-2 border-t border-border px-5 py-4 text-center sm:px-7">{footer}</footer>
      ) : null}
    </section>
  );
}

/** "veya" ayırıcısı — tek biçim. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="qx-caption uppercase tracking-wide text-fg-muted" aria-hidden>
        {label}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

/** Kart altı metin bağlantısı (44px dokunma alanı, görünür odak). */
export const authLinkClass =
  'qx-small inline-flex min-h-11 items-center rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
