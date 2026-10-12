'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';

const buttonVariants = cva(
  'inline-flex min-w-0 max-w-full touch-manipulation items-center justify-center gap-2 whitespace-normal text-center break-words sm:whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/25',
        outline:
          'border border-border/80 bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground dark:border-white/25 dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        gradient:
          'bg-gradient-to-r from-primary via-primary/90 to-primary/75 text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/25',
        // (`glass` varyantı kaldırıldı: açık temada beyaz-üstü-beyaz idi, kullanıcısı yoktu ve
        // globals.css'te sınıf adına göre `!important` güvenlik ağı gerektiriyordu.)
      },
      size: {
        default: 'h-11 min-h-11 px-4 py-2 text-base sm:text-sm',
        sm: 'hit-area h-9 rounded-md px-3',
        lg: 'h-12 rounded-lg px-8 text-base',
        xl: 'h-14 rounded-xl px-10 text-lg',
        icon: 'h-11 w-11',
        'icon-sm': 'hit-area h-9 w-9',
        'icon-lg': 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Spinner = () => (
  <svg
    className="h-4 w-4 shrink-0 animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

/**
 * `loading`: etiket KORUNUR (eski davranış etiketi "Yükleniyor" ile değiştirip
 * buton genişliğini zıplatıyor ve eylem bağlamını — "Sil", "Kaydet" — kaybettiriyordu).
 * Solda spinner, `aria-busy`, ekran okuyucuya "Yükleniyor" ek bilgisi; buton devre dışı.
 * Etiketsiz (yalnız ikon) butonda ikon yerine spinner gösterilir.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const t = useAppT();
    if (asChild) {
      // Slot tek çocuk ister: yükleme göstergesi enjekte edilmez, yalnız durum öznitelikleri.
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          // Eski davranış: `disabled` çocuğa iletilir (Slot tipi bilmez).
          {...({ disabled: disabled || loading } as React.HTMLAttributes<HTMLElement>)}
          aria-busy={loading || undefined}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    const iconOnly = size === 'icon' || size === 'icon-sm' || size === 'icon-lg';
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          iconOnly ? (
            <>
              <Spinner />
              <span className="sr-only">
                {children} {t('common.loading')}
              </span>
            </>
          ) : (
            <>
              <Spinner />
              {children}
              <span className="sr-only">{t('common.loading')}</span>
            </>
          )
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

