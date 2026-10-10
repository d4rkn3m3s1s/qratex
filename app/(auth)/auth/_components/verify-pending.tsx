'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck, RotateCw, ExternalLink, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { normalizeEmail } from '@/lib/auth/normalize-email';
import { useAuthCopy } from './auth-copy';
import { AuthNotice } from './auth-notice';
import { useResendVerification } from './use-resend-verification';

/**
 * "Gelen kutunu kontrol et" ekranı — kayıt sonrası, `/auth/verify` ve doğrulanmamış hesapla
 * giriş denemesinde ortak (P0-39: eskiden üretimde hiç görünmüyordu, kullanıcı "giriş
 * yapabilirsiniz" yalanından sonra sessizce login'e düşüyordu).
 */
export function VerifyPending({
  email,
  emailSent,
  devVerifyUrl,
  referralPending,
  onBack,
  backHref,
  initialCooldownSec = 0,
}: {
  /** Bilinen e-posta (kayıt formundan). Yoksa kullanıcı yazar. */
  email?: string | null;
  /** Kayıt yanıtındaki gönderim sonucu; bilinmiyorsa undefined. */
  emailSent?: boolean;
  /** Yalnız geliştirme ortamında (e-posta gönderilemediğinde) gelen bağlantı. */
  devVerifyUrl?: string | null;
  referralPending?: boolean;
  onBack?: () => void;
  backHref?: string;
  initialCooldownSec?: number;
}) {
  const copy = useAuthCopy();
  const { state, cooldown, send } = useResendVerification(initialCooldownSec);
  const [typedEmail, setTypedEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const knownEmail = email ? normalizeEmail(email) : '';

  const resend = () => {
    const target = knownEmail || normalizeEmail(typedEmail);
    if (!target || !target.includes('@')) {
      setEmailError(copy.invalidEmail);
      return;
    }
    setEmailError(null);
    void send({ email: target });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-subtle ring-1 ring-inset ring-brand-border">
          <MailCheck className="h-7 w-7 text-brand" aria-hidden />
        </div>
        <h1 className="qx-h2 text-fg">{copy.verifyPendingTitle}</h1>
        <p className="qx-body text-fg-muted text-pretty">
          {knownEmail ? copy.verifyPendingBody(knownEmail) : copy.verifyPendingGeneric}
        </p>
      </div>

      {emailSent === false ? <AuthNotice tone="warning">{copy.verifyPendingEmailNotSent}</AuthNotice> : null}
      {referralPending ? <AuthNotice tone="info">{copy.verifyReferralPending}</AuthNotice> : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button asChild variant="outline" className="w-full gap-2">
          <a href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noopener noreferrer">
            {copy.verifyPendingOpenGmail}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </Button>
        <Button asChild variant="outline" className="w-full gap-2">
          <a href="https://outlook.live.com/mail/0/" target="_blank" rel="noopener noreferrer">
            {copy.verifyPendingOpenOutlook}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </Button>
      </div>

      <p className="qx-small text-fg-muted text-center text-pretty">{copy.verifyPendingSpamHint}</p>

      {!knownEmail ? (
        <div className="space-y-1.5">
          <Label htmlFor="verify-resend-email">{copy.verifyPendingEmailLabel}</Label>
          <Input
            id="verify-resend-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={typedEmail}
            onChange={(e) => setTypedEmail(e.target.value)}
            error={!!emailError}
            errorId="verify-resend-email-error"
          />
          <InlineError id="verify-resend-email-error">{emailError}</InlineError>
        </div>
      ) : null}

      <Button
        type="button"
        className="w-full gap-2"
        onClick={resend}
        loading={state === 'sending'}
        disabled={cooldown > 0}
      >
        <RotateCw className="h-4 w-4" aria-hidden />
        {cooldown > 0 ? copy.resendIn(cooldown) : copy.resend}
      </Button>

      {state === 'sent' ? <AuthNotice tone="success">{copy.resendSent}</AuthNotice> : null}
      {state === 'rate_limited' || state === 'error' ? <AuthNotice tone="warning">{copy.resendFailed}</AuthNotice> : null}
      {state === 'mail_unavailable' ? <AuthNotice tone="warning">{copy.mailUnavailable}</AuthNotice> : null}

      {devVerifyUrl ? (
        <Button asChild variant="ghost" className="w-full">
          <a href={devVerifyUrl}>{copy.verifyPendingDevLink}</a>
        </Button>
      ) : null}

      <div className="flex flex-col items-center gap-2 pt-1">
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {copy.verifyPendingWrongEmail}
          </Button>
        ) : null}
        <Link
          href={backHref ?? '/auth/login'}
          className="qx-small rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy.backToLogin}
        </Link>
      </div>
    </div>
  );
}
