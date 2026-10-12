import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Kart yüzeyi (QDL `surface-1`, radius `card` = 16px). Izgarada eşit yükseklik için `h-full
 * flex-col` varsayılan; tek başına kartta etkisizdir (ebeveyn yüksekliği yoksa içerik kadar).
 * Eski `glass` / `gradient` seçenekleri kullanılmıyordu ve token dışıydı (`bg-white/85` renkli
 * preset zeminde beyaz kalıyordu) → kaldırıldı; vurgulu kart için `GlowCard` (play).
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    hover?: boolean;
  }
>(({ className, hover, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'min-w-0 h-full rounded-card border bg-card text-card-foreground shadow-sm flex flex-col',
      hover &&
        'qx-card-hover touch-manipulation transition-[box-shadow,border-color,transform] duration-base ease-standard hover:border-border hover:shadow-lg hover:shadow-primary/10 motion-reduce:transition-none motion-reduce:hover:shadow-sm',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      // QDL h3 (16px semibold). Eski `text-2xl` neredeyse her kullanımda eziliyordu.
      'text-base font-semibold leading-snug tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('min-w-0 p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

