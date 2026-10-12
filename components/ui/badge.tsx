import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-base ease-standard focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 touch-manipulation',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        // QDL rol token'ları: her temada ≥ 4.5:1 (eski green/yellow/blue-500 açık zeminde 1,9–2,3:1 idi)
        success:
          'border-success-border bg-success-subtle text-success hover:bg-success-subtle/80',
        warning:
          'border-warning-border bg-warning-subtle text-warning hover:bg-warning-subtle/80',
        info:
          'border-info-border bg-info-subtle text-info hover:bg-info-subtle/80',
        danger:
          'border-danger-border bg-danger-subtle text-danger hover:bg-danger-subtle/80',
        brand:
          'border-brand-border bg-brand-subtle text-brand hover:bg-brand-subtle/80',
        // Nadirlik (common/rare/epic/legendary) varyantları kaldırıldı: kullanıcısı yoktu, ham
        // paletteydi ve efsanevi sarı rozete mor parıltı veriyordu → `RarityBadge` (ds/play).
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/** `<span>`: paragraf/başlık içinde geçerli HTML (eski `<div>` geçersiz iç içe yapı üretiyordu). */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

