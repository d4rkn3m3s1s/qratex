'use client';

import { forwardRef, type MouseEvent } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SelectionCheckboxProps = {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  /** Tıklama olayı (Shift ile aralık seçimi için). */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
};

/**
 * Tablo seçim kutusu — görünür 18px, tıklama alanı 44px (`before:` ile
 * genişletilir; düzeni bozmaz). Kısmi seçimde "−" işareti.
 */
export const SelectionCheckbox = forwardRef<HTMLButtonElement, SelectionCheckboxProps>(function SelectionCheckbox(
  { checked, onCheckedChange, onClick, disabled, className, 'aria-label': ariaLabel },
  ref,
) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        // Kutu 24px (WCAG 2.5.8 hedef boyutu axe ölçümü sözde-öğeyi saymaz); görünür kare 18px iç
        // span, negatif kenar boşluğu düzendeki 18px ayak izini korur, before: 44px dokunma alanı.
        'peer group relative -m-[0.1875rem] grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[0.4375rem] text-brand-fg',
        "before:absolute before:-inset-[0.625rem] before:content-['']",
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid h-[1.125rem] w-[1.125rem] place-items-center rounded-[0.3125rem] border border-strong bg-surface-1 transition-colors duration-fast ease-standard group-data-[state=checked]:border-brand group-data-[state=checked]:bg-brand group-data-[state=indeterminate]:border-brand group-data-[state=indeterminate]:bg-brand"
      >
        <CheckboxPrimitive.Indicator className="grid place-items-center">
          {checked === 'indeterminate' ? <Minus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
});
