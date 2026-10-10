import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 transition-[border-color,background-color,box-shadow] duration-200 supports-[backdrop-filter]:backdrop-blur-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11',
  {
    variants: {
      variant: {
        default:
          'bg-muted/30 text-foreground shadow-sm shadow-black/5 dark:shadow-black/20',
        // Metin `text-destructive` → --danger-text (her temada ≥ 4.5:1; eski koyu tema 1,93:1).
        destructive:
          'border-danger-border bg-danger-subtle text-danger shadow-sm [&>svg]:text-danger',
        success:
          'border-success-border bg-success-subtle text-fg shadow-sm [&>svg]:text-success',
        warning:
          'border-warning-border bg-warning-subtle text-fg shadow-sm [&>svg]:text-warning',
        info:
          'border-info-border bg-info-subtle text-fg shadow-sm [&>svg]:text-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-pretty text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
