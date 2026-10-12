'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { Check, Eye, EyeOff, Lock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { useAuthCopy } from './copy';
import { evaluatePassword, PASSWORD_CHECK_KEYS, PASSWORD_MAX_LENGTH, type PasswordStrength } from './password-policy';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  id: string;
  label: string;
  value: string;
  error?: string | null;
  /** Yeni şifre: canlı kural listesi + güç çubuğu gösterilir. */
  showStrength?: boolean;
  /** Göster/gizle durumu dışarıdan yönetilebilir (iki alan birlikte açılsın diye). */
  visible?: boolean;
  onVisibleChange?: (v: boolean) => void;
  /** Etiket satırının sağındaki ek bağlantı (ör. "Şifremi unuttum"). */
  labelAction?: React.ReactNode;
};

const STRENGTH_BAR: Record<Exclude<PasswordStrength, 0>, string> = {
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-success',
  4: 'bg-success',
};

/**
 * Şifre alanı — giriş, kayıt, sıfırlama ve OAuth sonrası şifre oluşturmada TEK bileşen.
 * Göster/gizle 44×44 dokunma hedefi; hata `aria-describedby` ile alana bağlı; yeni şifrede
 * kurallar yazarken canlı işaretlenir (hata vermeden ÖNCE görünür) ve güç seviyesi metinle de
 * söylenir (yalnız renge dayanmaz).
 */
export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  { id, label, value, error, showStrength, visible, onVisibleChange, labelAction, className, ...rest },
  ref,
) {
  const copy = useAuthCopy();
  const [localVisible, setLocalVisible] = useState(false);
  const shown = visible ?? localVisible;
  const toggle = () => (onVisibleChange ? onVisibleChange(!shown) : setLocalVisible(!shown));
  const errorId = `${id}-error`;
  const rulesId = useId();
  const ev = showStrength ? evaluatePassword(value) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          ref={ref}
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          maxLength={PASSWORD_MAX_LENGTH}
          autoCapitalize="none"
          spellCheck={false}
          className={cn('pl-10 pr-12', className)}
          error={!!error}
          errorId={errorId}
          aria-describedby={ev ? rulesId : undefined}
          {...rest}
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={shown ? copy.hidePassword : copy.showPassword}
          aria-pressed={shown}
          aria-controls={id}
        >
          {shown ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      <InlineError id={errorId}>{error}</InlineError>
      {ev ? (
        <div id={rulesId} className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={cn(
                    'h-1.5 rounded-full transition-colors duration-base',
                    ev.strength >= step && ev.strength > 0 ? STRENGTH_BAR[ev.strength as 1 | 2 | 3 | 4] : 'bg-surface-3',
                  )}
                />
              ))}
            </div>
            <span className="qx-caption min-w-[7.5rem] text-right text-fg-muted" aria-live="polite">
              {copy.passwordStrength(ev.strength)}
            </span>
          </div>
          <p className="sr-only">{copy.passwordRulesTitle}</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {PASSWORD_CHECK_KEYS.map((key) => {
              const okRule = ev.checks[key];
              return (
                <li key={key} className={cn('qx-caption flex items-center gap-1.5', okRule ? 'text-success' : 'text-fg-muted')}>
                  {okRule ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <X className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  <span>
                    {copy.passwordRules[key]}
                    <span className="sr-only">{okRule ? ' ✓' : ' ✗'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
});

/** Tekrar alanının altında canlı eşleşme göstergesi. */
export function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  const copy = useAuthCopy();
  if (!confirm) return null;
  const match = password === confirm;
  return (
    <p className={cn('qx-caption flex items-center gap-1.5', match ? 'text-success' : 'text-fg-muted')} aria-live="polite">
      {match ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
      {match ? copy.passwordsMatch : copy.passwordsDontMatch}
    </p>
  );
}
