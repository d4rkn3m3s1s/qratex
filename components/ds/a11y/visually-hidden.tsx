'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

export type VisuallyHiddenProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** Tek çocuğu sarmadan gizler (ör. `<VisuallyHidden asChild><h2>…</h2></VisuallyHidden>`). */
  asChild?: boolean;
  /** Klavye odağı aldığında görünür olur (atlama bağlantısı, "yukarı dön" vb.). */
  focusable?: boolean;
};

/**
 * Görsel olarak gizli, ekran okuyucuya açık içerik. `display:none`/`hidden`
 * erişilebilirlik ağacından da siler — bunun yerine bu bileşeni kullanın.
 *
 *   <button><TrashIcon aria-hidden /><VisuallyHidden>Sil</VisuallyHidden></button>
 */
export const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ asChild, focusable, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'span';
    return (
      <Comp
        ref={ref}
        className={cn('sr-only', focusable && 'focus:not-sr-only focus-within:not-sr-only', className)}
        {...props}
      />
    );
  },
);
VisuallyHidden.displayName = 'VisuallyHidden';
