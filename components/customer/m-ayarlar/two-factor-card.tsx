'use client';

import { useId, useState } from 'react';
import { Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InlineError } from '@/components/states';
import type { SecurityState } from '@/lib/customer-settings/contract';
import { callLegacy, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { dateFormatter, Panel } from './ui';
import { useSettingsCache } from './use-settings';

type Phase = { kind: 'idle' } | { kind: 'setup'; secret: string; qr: string | null } | { kind: 'codes'; codes: string[] };

function CodeInput({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="max-w-[10rem] text-base tracking-[0.3em]"
      />
    </div>
  );
}

/**
 * 2FA (TOTP) — kurulum (QR + elle anahtar + doğrulama), kurtarma kodları (kopyala / .txt indir /
 * yeniden üret), kapatma. Eski kart `window.prompt` kullanıyordu (PWA/WebView'da güvenilmez);
 * artık erişilebilir diyalog + OTP alanı. QR kütüphanesi yalnız kurulumda yüklenir.
 * Sunucu her durum değişikliğinde oturum sürümünü artırır (diğer cihazlar düşer).
 */
export function TwoFactorCard({ twoFactor }: { twoFactor: SecurityState['twoFactor'] }) {
  const { copy, locale } = useSettingsCopy();
  const cache = useSettingsCache();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'disable' | 'regenerate'>(null);
  const [dialogCode, setDialogCode] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const codeId = useId();
  const dialogCodeId = useId();

  const fail = (e: unknown) => errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined);

  const startSetup = async () => {
    setPending(true);
    setError(null);
    try {
      const out = await callLegacy<{ secret: string; otpauthUri: string }>('/api/auth/2fa', {
        method: 'POST',
        body: JSON.stringify({ action: 'setup' }),
      });
      let qr: string | null = null;
      try {
        const QR = (await import('qrcode')).default;
        qr = await QR.toDataURL(out.otpauthUri, { margin: 1, width: 220 });
      } catch {
        qr = null; // QR üretilemezse elle anahtar yine gösterilir
      }
      setPhase({ kind: 'setup', secret: out.secret, qr });
      setCode('');
    } catch (e) {
      setError(fail(e));
    } finally {
      setPending(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError(copy.tfaCodeInvalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const out = await callLegacy<{ recoveryCodes?: string[] }>('/api/auth/2fa', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify', code }),
      });
      const codes = out.recoveryCodes ?? [];
      cache.patch((prev) => ({
        ...prev,
        security: {
          ...prev.security,
          twoFactor: { enabled: true, since: new Date().toISOString(), remainingRecoveryCodes: codes.length },
        },
      }));
      toast.success(copy.tfaEnabled);
      setPhase(codes.length ? { kind: 'codes', codes } : { kind: 'idle' });
    } catch (e) {
      setError(fail(e));
    } finally {
      setPending(false);
    }
  };

  const confirmDialog = async () => {
    if (!/^\d{6}$/.test(dialogCode)) {
      setDialogError(copy.tfaCodeInvalid);
      return;
    }
    setPending(true);
    setDialogError(null);
    try {
      if (dialog === 'disable') {
        await callLegacy('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ action: 'disable', code: dialogCode }) });
        cache.patch((prev) => ({
          ...prev,
          security: { ...prev.security, twoFactor: { enabled: false, since: null, remainingRecoveryCodes: 0 } },
        }));
        toast.success(copy.tfaDisabled);
        setPhase({ kind: 'idle' });
      } else {
        const out = await callLegacy<{ recoveryCodes?: string[] }>('/api/auth/2fa', {
          method: 'POST',
          body: JSON.stringify({ action: 'recovery-codes', code: dialogCode }),
        });
        const codes = out.recoveryCodes ?? [];
        cache.patch((prev) => ({
          ...prev,
          security: { ...prev.security, twoFactor: { ...prev.security.twoFactor, remainingRecoveryCodes: codes.length } },
        }));
        setPhase({ kind: 'codes', codes });
      }
      setDialog(null);
      setDialogCode('');
    } catch (e) {
      setDialogError(fail(e));
    } finally {
      setPending(false);
    }
  };

  const copyCodes = (codes: string[]) => {
    navigator.clipboard
      .writeText(codes.join('\n'))
      .then(() => toast.success(copy.tfaRecoveryCopied))
      .catch(() => toast.error(copy.genericError));
  };

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob([`QRATEX — ${copy.tfaRecoveryTitle}\n\n${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qratex-kurtarma-kodlari.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const since = twoFactor.since ? dateFormatter(locale).format(new Date(twoFactor.since)) : null;

  return (
    <Panel
      title={copy.tfaTitle}
      description={twoFactor.enabled ? copy.tfaDescOn(since) : copy.tfaDescOff}
      icon={twoFactor.enabled ? <ShieldCheck /> : <ShieldOff />}
    >
      {phase.kind === 'codes' ? (
        <div className="space-y-3 rounded-control border border-warning-border bg-warning-subtle p-3">
          <p className="text-sm font-semibold text-fg">{copy.tfaRecoveryTitle}</p>
          <p className="qx-small text-fg">{copy.tfaRecoveryDesc}</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-fg" aria-label={copy.tfaRecoveryTitle}>
            {phase.codes.map((c) => (
              <li key={c} className="rounded-chip bg-surface-1 px-2 py-1.5 text-center">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => copyCodes(phase.codes)}>
              <Copy aria-hidden className="h-4 w-4" />
              {copy.tfaRecoveryCopy}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => downloadCodes(phase.codes)}>
              <Download aria-hidden className="h-4 w-4" />
              {copy.tfaRecoveryDownload}
            </Button>
            <Button type="button" size="sm" onClick={() => setPhase({ kind: 'idle' })}>
              {copy.tfaRecoveryDone}
            </Button>
          </div>
        </div>
      ) : phase.kind === 'setup' ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="qx-small text-fg-muted">{copy.tfaScan}</p>
          {phase.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- yerel üretilmiş data URI
            <img src={phase.qr} alt={copy.tfaQrAlt} width={200} height={200} className="rounded-control border border-subtle bg-white p-2" />
          ) : null}
          <div>
            <p className="qx-small text-fg-muted">{copy.tfaManual}</p>
            <code className="mt-1 block break-all rounded-chip bg-surface-muted px-2 py-1.5 font-mono text-sm text-fg">{phase.secret}</code>
          </div>
          <CodeInput id={codeId} value={code} onChange={setCode} label={copy.tfaCodeLabel} />
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending} disabled={pending || code.length !== 6}>
              {copy.tfaVerify}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPhase({ kind: 'idle' })} disabled={pending}>
              {copy.tfaCancel}
            </Button>
          </div>
        </form>
      ) : twoFactor.enabled ? (
        <div className="space-y-3">
          <p className="qx-small text-fg-muted">{copy.tfaRemaining(twoFactor.remainingRecoveryCodes)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setDialog('regenerate')}>
              {copy.tfaRegenerate}
            </Button>
            <Button type="button" variant="ghost" className="text-danger" onClick={() => setDialog('disable')}>
              {copy.tfaDisable}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" onClick={() => void startSetup()} loading={pending} disabled={pending} className="gap-2">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            {copy.tfaStart}
          </Button>
          {error ? <InlineError>{error}</InlineError> : null}
        </div>
      )}

      <AlertDialog
        open={dialog !== null}
        onOpenChange={(o) => {
          if (!o && !pending) {
            setDialog(null);
            setDialogCode('');
            setDialogError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog === 'disable' ? copy.tfaDisableTitle : copy.tfaRegenTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dialog === 'disable' ? copy.tfaDisableBody : copy.tfaRegenBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id={`${dialogCodeId}-form`}
            onSubmit={(e) => {
              e.preventDefault();
              void confirmDialog();
            }}
          >
            <CodeInput id={dialogCodeId} value={dialogCode} onChange={setDialogCode} label={copy.tfaCodeLabel} />
            {dialogError ? <InlineError>{dialogError}</InlineError> : null}
          </form>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={pending} className="mt-0">
              {copy.tfaCancel}
            </AlertDialogCancel>
            <Button
              type="submit"
              form={`${dialogCodeId}-form`}
              variant={dialog === 'disable' ? 'destructive' : 'default'}
              loading={pending}
              disabled={pending || dialogCode.length !== 6}
            >
              {copy.tfaConfirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
