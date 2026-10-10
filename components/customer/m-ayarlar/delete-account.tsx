'use client';

import { useId, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, LogIn, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/states';
import { deleteAccount, fetchDeletePreview, SettingsApiError, settingsKeys } from './api';
import { errorText, useSettingsCopy } from './copy';
import { Panel } from './ui';

const RELOGIN_URL = `/auth/login?callbackUrl=${encodeURIComponent('/customer/me/settings?tab=privacy')}`;

/**
 * Hesap silme — kayıp özeti (sunucudan) + yeniden kimlik doğrulama (denetim B4):
 * şifre (varsa), 2FA kodu (açıksa); ikisi de yoksa son 10 dk içinde giriş. E-posta onayı
 * büyük/küçük harf duyarsız; alan yer tutucu olarak e-postayı GÖSTERMEZ. Sunucu hesabı
 * anonimleştirir (cascade silme yok) ve KVKK kanıt zincirini aynı işlemde yazar.
 */
export function DeleteAccount() {
  const { copy } = useSettingsCopy();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailId = useId();
  const pwId = useId();
  const totpId = useId();
  const titleId = useId();

  const preview = useQuery({
    queryKey: settingsKeys.deletePreview,
    queryFn: fetchDeletePreview,
    enabled: open,
    staleTime: 0,
    retry: 1,
  });

  const p = preview.data;
  const methods = p?.reauth.methods ?? [];
  const needsRelogin = methods.includes('recent-login') && !p?.reauth.recentLoginFresh;
  const blocked = !!p && (p.blockers.length > 0 || !p.selfDeleteAllowed);
  const ready =
    !!p &&
    !blocked &&
    !needsRelogin &&
    email.trim().length >= 3 &&
    (!methods.includes('password') || password.length > 0) &&
    (!methods.includes('totp') || /^\d{6}$/.test(totp.trim()));

  const reset = () => {
    setEmail('');
    setPassword('');
    setTotp('');
    setError(null);
  };

  const submit = async () => {
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await deleteAccount({
        confirmEmail: email.trim(),
        ...(methods.includes('password') ? { password } : {}),
        ...(methods.includes('totp') ? { totp: totp.trim() } : {}),
      });
      setError(null);
      await signOut({ callbackUrl: '/' });
    } catch (e) {
      setError(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
      if (e instanceof SettingsApiError && e.code === 'REAUTH_RECENT_LOGIN') void preview.refetch();
    } finally {
      setPending(false);
    }
  };

  const losses = p
    ? [
        { label: copy.lossPoints, value: p.losses.points },
        { label: copy.lossBadges, value: p.losses.badges },
        { label: copy.lossRewards, value: p.losses.rewards },
        { label: copy.lossFeedbacks, value: p.losses.feedbacks },
        { label: copy.lossReviews, value: p.losses.reviews },
      ]
    : [];

  return (
    <Panel title={copy.deleteTitle} description={copy.deleteDesc} icon={<Trash2 />} tone="danger">
      <Button
        type="button"
        variant="destructive"
        className="gap-2"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden className="h-4 w-4" />
        {copy.deleteOpen}
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto" aria-labelledby={titleId}>
          <AlertDialogHeader>
            <AlertDialogTitle id={titleId} className="flex items-center gap-2">
              <AlertTriangle aria-hidden className="h-5 w-5 text-danger" />
              {copy.deleteDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {copy.deleteDesc} {copy.deleteIrreversible}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {preview.isLoading ? (
            <p className="qx-small text-fg-muted" role="status">
              {copy.deleteLoading}
            </p>
          ) : preview.isError || !p ? (
            <InlineError variant="banner" onRetry={() => void preview.refetch()}>
              {copy.deleteLoadError}
            </InlineError>
          ) : blocked ? (
            <div className="rounded-control border border-warning-border bg-warning-subtle p-3">
              <p className="text-sm font-semibold text-fg">{copy.deleteBlocked}</p>
              {p.blockers.map((b) => (
                <p key={b} className="qx-small text-fg">
                  {b}
                </p>
              ))}
            </div>
          ) : (
            <form
              id={`${titleId}-form`}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="rounded-control border border-danger-border bg-danger-subtle p-3">
                <p className="text-sm font-semibold text-fg">{copy.deleteLossTitle}</p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  {losses.map((l) => (
                    <div key={l.label} className="contents">
                      <dt className="qx-small text-fg">{l.label}</dt>
                      <dd className="qx-small qx-num text-right font-semibold text-fg">{l.value.toLocaleString('tr-TR')}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {needsRelogin ? (
                <div className="space-y-2 rounded-control border border-subtle bg-surface-muted p-3">
                  <p className="qx-small text-fg">{copy.deleteRecentLogin}</p>
                  <Button type="button" variant="outline" className="gap-2" onClick={() => void signOut({ callbackUrl: RELOGIN_URL })}>
                    <LogIn aria-hidden className="h-4 w-4" />
                    {copy.deleteRelogin}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor={emailId} className="text-sm font-medium text-fg">
                      {copy.deleteEmailLabel}
                    </label>
                    <Input
                      id={emailId}
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="text-base"
                    />
                  </div>
                  {methods.includes('password') ? (
                    <div className="space-y-1.5">
                      <label htmlFor={pwId} className="text-sm font-medium text-fg">
                        {copy.deletePasswordLabel}
                      </label>
                      <Input
                        id={pwId}
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="text-base"
                      />
                    </div>
                  ) : null}
                  {methods.includes('totp') ? (
                    <div className="space-y-1.5">
                      <label htmlFor={totpId} className="text-sm font-medium text-fg">
                        {copy.deleteTotpLabel}
                      </label>
                      <Input
                        id={totpId}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="\d{6}"
                        maxLength={6}
                        value={totp}
                        onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="max-w-[10rem] text-base tracking-[0.3em]"
                      />
                    </div>
                  ) : null}
                </>
              )}
              {error ? <InlineError>{error}</InlineError> : null}
            </form>
          )}

          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={pending} className="mt-0">
              {copy.deleteCancel}
            </AlertDialogCancel>
            <Button
              type="submit"
              form={`${titleId}-form`}
              variant="destructive"
              loading={pending}
              disabled={!ready || pending}
            >
              {copy.deleteConfirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
