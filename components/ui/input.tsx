import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  /** Hata mesajı elemanının id'si — aria-describedby ile bağlanır (erişilebilirlik). */
  errorId?: string;
}

const KEYBOARD_DEFAULTS: Record<string, Pick<React.InputHTMLAttributes<HTMLInputElement>, 'inputMode' | 'enterKeyHint' | 'autoComplete' | 'autoCapitalize' | 'spellCheck'>> = {
  search: { inputMode: 'search', enterKeyHint: 'search', autoComplete: 'off' },
  email: { inputMode: 'email', enterKeyHint: 'next', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false },
  tel: { inputMode: 'tel', enterKeyHint: 'next', autoComplete: 'tel' },
  url: { inputMode: 'url', autoCapitalize: 'none', spellCheck: false },
  password: { autoCapitalize: 'none', spellCheck: false },
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, errorId, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    // error → aria-invalid (ekran okuyucu hatayı duyar); errorId varsa describedby.
    const describedBy = [ariaDescribedBy, error && errorId ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;
    // Mobil klavye ipuçları (native/PWA): türden türetilen varsayılanlar; çağıran prop'u ezer.
    const keyboardDefaults = KEYBOARD_DEFAULTS[type ?? ''] ?? null;
    return (
      <input
        type={type}
        {...keyboardDefaults}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        className={cn(
          'flex h-11 min-h-11 w-full min-w-0 max-w-full touch-manipulation rounded-lg border bg-background px-3 py-2 text-base sm:text-sm text-foreground ring-offset-background transition-[color,background-color,border-color,box-shadow] duration-base ease-standard qx-field',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-destructive shadow-sm focus-visible:ring-destructive'
            : 'border-strong shadow-sm dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };

