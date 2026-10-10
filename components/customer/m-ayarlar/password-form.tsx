'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { callLegacy, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { dateFormatter, Panel } from './ui';
import { useSettingsCache } from './use-settings';

/** 0–4 kaba güç puanı (yalnız rehberlik; kural sunucuda: 8–200 karakter). */
export function passwordScore(pw: string): number {
  if (pw.length < 8) return 0;
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[a-zçğıöşü]/.test(pw) && /[A-ZÇĞİÖŞÜ]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/.test(pw)) score++;
  return Math.min(4, score);
}

const BAR_TONE = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'];

/**
 * Şifre değiştir / oluştur. Gerçek `<form>` (Enter ile gönderilir), doğru `autocomplete`
 * değerleri (parola yöneticileri), göster/gizle, güç göstergesi. Şifre değişince sunucu
 * oturum sürümünü artırır: diğer cihazlar düşer, bu cihazın çerezi yenilenir.
 */
export function PasswordForm({ hasPassword, lastChangedAt }: { hasPassword: boolean; lastChangedAt: string | null }) {
  const { copy, locale } = useSettingsCopy();
  const cache = useSettingsCache();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const curId = useId();
  const newId = useId();
  const confId = useId();
  const strengthId = useId();

  const score = passwordScore(next);
  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = next.length >= 8 && next.length <= 200 && next === confirm && (!hasPassword || current.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      if (hasPassword) {
        await callLegacy('/api/user/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
        toast.success(copy.pwChanged);
      } else {
        await callLegacy('/api/user/initial-password', { method: 'POST', body: JSON.stringify({ newPassword: next }) });
        toast.success(copy.pwCreated);
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      cache.patch((prev) => ({
        ...prev,
        security: { ...prev.security, hasPassword: true, lastPasswordChangeAt: new Date().toISOString() },
      }));
    } catch (e) {
      setError(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
    } finally {
      setPending(false);
    }
  };

  const type = show ? 'text' : 'password';
  const toggle = (
    <IconButton
      type="button"
      aria-label={show ? copy.hidePassword : copy.showPassword}
      icon={show ? <EyeOff /> : <Eye />}
      variant="ghost"
      pressed={show}
      onClick={() => setShow((s) => !s)}
    />
  );

  return (
    <Panel
      title={hasPassword ? copy.passwordTitleChange : copy.passwordTitleCreate}
      description={
        <>
          {hasPassword ? copy.passwordDescChange : copy.passwordDescCreate}
          {lastChangedAt ? <span className="mt-0.5 block">{copy.passwordLast(dateFormatter(locale).format(new Date(lastChangedAt)))}</span> : null}
        </>
      }
      icon={<KeyRound />}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* Parola yöneticileri için gizli kullanıcı adı alanı (erişilebilirlik ağacının dışında). */}
        <input type="text" name="username" autoComplete="username" className="hidden" aria-hidden tabIndex={-1} readOnly />
        {hasPassword ? (
          <div className="space-y-1.5">
            <label htmlFor={curId} className="text-sm font-medium text-fg">
              {copy.currentPassword}
            </label>
            <Input id={curId} type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="text-base" />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={newId} className="text-sm font-medium text-fg">
              {copy.newPassword}
            </label>
            {toggle}
          </div>
          <Input
            id={newId}
            type={type}
            autoComplete="new-password"
            value={next}
            maxLength={200}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={tooShort}
            aria-describedby={strengthId}
            className="text-base"
          />
          <div id={strengthId} className="space-y-1">
            <div className="flex gap-1" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn('h-1.5 flex-1 rounded-full transition-colors duration-fast', next && score >= i ? BAR_TONE[score] : 'bg-surface-muted')}
                />
              ))}
            </div>
            <p className="qx-caption text-fg-muted">
              {tooShort ? copy.pwTooShort : next ? `${copy.strengthLabel}: ${copy.strength[score]}` : copy.pwTooShort}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={confId} className="text-sm font-medium text-fg">
            {copy.confirmPassword}
          </label>
          <Input
            id={confId}
            type={type}
            autoComplete="new-password"
            value={confirm}
            maxLength={200}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
            aria-describedby={mismatch ? `${confId}-err` : undefined}
            className="text-base"
          />
          {mismatch ? <InlineError id={`${confId}-err`}>{copy.pwMismatch}</InlineError> : null}
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <Button type="submit" loading={pending} disabled={!canSubmit || pending}>
          {hasPassword ? copy.pwSubmitChange : copy.pwSubmitCreate}
        </Button>
      </form>
    </Panel>
  );
}
