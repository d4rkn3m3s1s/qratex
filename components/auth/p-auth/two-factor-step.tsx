'use client';

import { useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { useAuthCopy } from './copy';

const OTP_LENGTH = 6;

/**
 * 6 haneli kod alanı — TEK gerçek `<input>` (ekran okuyucu ve `autocomplete="one-time-code"`
 * SMS/Keychain önerisi doğru çalışsın), görünümde 6 hücre. Yapıştırma desteklenir; 6. hanede
 * `onComplete` tetiklenir. Hücreler dekoratiftir (`aria-hidden`).
 */
export function OtpField({
  id,
  label,
  value,
  onChange,
  onComplete,
  error,
  disabled,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const errorId = `${id}-error`;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(digits);
    if (digits.length === OTP_LENGTH) onComplete?.(digits);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative" onClick={() => inputRef.current?.focus()}>
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: OTP_LENGTH }, (_, i) => {
            const char = value[i] ?? '';
            const active = focused && (i === value.length || (i === OTP_LENGTH - 1 && value.length === OTP_LENGTH));
            return (
              <div
                key={i}
                className={cn(
                  'flex h-14 items-center justify-center rounded-control border bg-surface-0 text-2xl font-semibold tabular-nums text-fg transition-colors duration-fast',
                  error ? 'border-danger' : active ? 'border-brand ring-2 ring-ring' : 'border-border',
                  disabled && 'opacity-60',
                )}
              >
                {char}
              </div>
            );
          })}
        </div>
        <input
          ref={inputRef}
          id={id}
          name="one-time-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH}
          enterKeyHint="go"
          value={value}
          disabled={disabled}
          onChange={(e) => handle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      </div>
      <InlineError id={errorId}>{error}</InlineError>
    </div>
  );
}

/**
 * İkinci adım (TOTP veya kurtarma kodu) — giriş sayfası ve bağlantıyla giriş (magic / OAuth
 * 2. adım) aynı bileşeni kullanır. Varsayılan 6 haneli kod; "kurtarma kodu kullan" ile serbest
 * metin alanına geçilir.
 */
export function TwoFactorStep({
  body,
  error,
  submitting,
  onSubmit,
  onBack,
  attempt = 0,
  showIntro = true,
}: {
  /** Kart başlığı zaten 2FA'yı anlatıyorsa (bağlantıyla giriş) üst bilgi kutusu gizlenir. */
  showIntro?: boolean;
  body?: string;
  error?: string | null;
  /** Her başarısız denemede artar; alan temizlenir (aynı hata metni tekrar gelse de). */
  attempt?: number;
  submitting?: boolean;
  onSubmit: (code: string) => void;
  onBack?: () => void;
}) {
  const copy = useAuthCopy();
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Sunucu hatası gelince alan temizlenir; kullanıcı yeniden yazar.
  useEffect(() => {
    if (attempt > 0) setCode('');
  }, [attempt]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if ((mode === 'totp' && trimmed.length !== OTP_LENGTH) || (mode === 'recovery' && trimmed.length < 6)) {
      setLocalError(copy.twoFactorCodeShort);
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  };

  const shownError = localError ?? error ?? null;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitting) submit(code);
      }}
    >
      {showIntro ? (
        <div className="flex items-start gap-3 rounded-control border border-border bg-surface-0 px-4 py-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <p className="qx-small font-semibold text-fg">{copy.twoFactorTitle}</p>
            <p className="qx-small text-fg-muted text-pretty">{body ?? copy.twoFactorBody}</p>
          </div>
        </div>
      ) : null}

      {mode === 'totp' ? (
        <OtpField
          id="two-factor-code"
          label={copy.twoFactorLabel}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (localError) setLocalError(null);
          }}
          onComplete={(v) => {
            if (!submitting) submit(v);
          }}
          error={shownError}
          disabled={submitting}
          autoFocus
        />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="two-factor-recovery">{copy.twoFactorRecoveryLabel}</Label>
          <Input
            id="two-factor-recovery"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={32}
            autoFocus
            placeholder={copy.twoFactorRecoveryPlaceholder}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (localError) setLocalError(null);
            }}
            error={!!shownError}
            errorId="two-factor-recovery-error"
            className="font-mono tracking-wider"
          />
          <InlineError id="two-factor-recovery-error">{shownError}</InlineError>
        </div>
      )}

      <Button type="submit" className="w-full" loading={submitting}>
        {copy.twoFactorSubmit}
      </Button>

      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          className="qx-small inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setMode((m) => (m === 'totp' ? 'recovery' : 'totp'));
            setCode('');
            setLocalError(null);
          }}
          disabled={submitting}
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          {mode === 'totp' ? copy.twoFactorUseRecovery : copy.twoFactorUseApp}
        </button>
        {onBack ? (
          <Button type="button" variant="ghost" className="w-full" onClick={onBack} disabled={submitting}>
            {copy.twoFactorBack}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
