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
        'peer relative grid h-[1.125rem] w-[1.125rem] shrink-0 cursor-pointer place-items-center rounded-[0.3125rem] border border-strong bg-surface-1 text-brand-fg',
        "before:absolute before:-inset-[0.8125rem] before:content-['']",
        'transition-colors duration-fast ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1',
        'data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center">
        {checked === 'indeterminate' ? <Minus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
