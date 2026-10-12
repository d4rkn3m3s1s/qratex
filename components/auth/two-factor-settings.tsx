'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ShieldOff, Loader2, Copy } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { useLocaleSafe } from '@/lib/app-locale';

type Status = { enabled: boolean; remainingRecoveryCodes: number };

/**
 * 2FA (TOTP) ayar kartı — kurulum (QR + doğrula), kurtarma kodları, devre dışı.
 * /api/auth/2fa'ya bağlı. Hesap güvenlik sekmesine gömülür.
 */
export function TwoFactorSettings() {
  const en = useLocaleSafe() === 'en';
  const L = (tr: string, enText: string) => (en ? enText : tr);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const refresh = () => {
    fetch('/api/auth/2fa')
      .then((r) => r.json())
      .then((d) => setStatus({ enabled: !!d.enabled, remainingRecoveryCodes: d.remainingRecoveryCodes ?? 0 }))
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || L('Kurulum başlatılamadı', 'Couldn’t start setup'));
      setSetupSecret(data.secret);
      // qrcode yalnız kurulum anında gerekir; ayarlar sayfasının paketine girmez (perf O7).
      const { default: QRCode } = await import('qrcode');
      setQrDataUrl(await QRCode.toDataURL(data.otpauthUri));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : L('Kurulum başlatılamadı', 'Couldn’t start setup'));
    } finally {
      setLoading(false);
    }
  };

  const verifyEnable = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error(L('6 haneli kodu girin', 'Enter the 6-digit code'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || L('Doğrulama başarısız', 'Verification failed'));
      toast.success(L('2FA etkinleştirildi', '2FA is on'));
      setRecoveryCodes(data.recoveryCodes ?? null);
      setSetupSecret(null);
      setQrDataUrl(null);
      setCode('');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : L('Doğrulama başarısız', 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    const c = prompt(L('2FA kapatmak için authenticator kodunuzu girin:', 'Enter your authenticator code to turn off 2FA:'));
    if (!c) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', code: c.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || L('Devre dışı bırakılamadı', 'Couldn’t turn off 2FA'));
      toast.success(L('2FA devre dışı bırakıldı', '2FA is off'));
      setRecoveryCodes(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : L('Devre dışı bırakılamadı', 'Couldn’t turn off 2FA'));
    } finally {
      setLoading(false);
    }
  };

  const copyCodes = () => {
    if (recoveryCodes) {
      navigator.clipboard.writeText(recoveryCodes.join('\n')).then(() => toast.success(L('Kurtarma kodları kopyalandı', 'Recovery codes copied')));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {status?.enabled ? <ShieldCheck className="h-5 w-5 text-success-text" /> : <ShieldOff className="h-5 w-5 text-muted-foreground" />}
          {L('İki Adımlı Doğrulama (2FA)', 'Two-factor authentication (2FA)')}
        </CardTitle>
        <CardDescription>
          {L('Authenticator uygulaması (Google Authenticator, Authy vb.) ile hesabınıza ek güvenlik katmanı.', 'An extra layer of security for your account using an authenticator app (Google Authenticator, Authy, etc.).')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Kurtarma kodları (yalnızca etkinleştirmeden/yenilemeden hemen sonra) */}
        {recoveryCodes && (
          <div className="rounded-lg border border-warning-border bg-warning-subtle p-4">
            <p className="mb-2 text-sm font-medium">{L('Kurtarma kodlarınız — güvenli bir yere kaydedin (yalnızca bir kez gösterilir):', 'Your recovery codes — save them somewhere safe (shown only once):')}</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <span key={c} className="rounded bg-muted px-2 py-1 text-center">{c}</span>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={copyCodes}>
              <Copy className="h-4 w-4" /> {L('Kopyala', 'Copy')}
            </Button>
          </div>
        )}

        {status?.enabled && !recoveryCodes && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="text-sm">
              <p className="font-medium text-success-text">{L('2FA aktif ✓', '2FA on ✓')}</p>
              <p className="text-muted-foreground">{L('Kalan kurtarma kodu', 'Recovery codes left')}: {status.remainingRecoveryCodes}</p>
            </div>
            <Button variant="outline" onClick={disable} disabled={loading}>
              <ShieldOff className="h-4 w-4" /> {L('Devre dışı bırak', 'Turn off')}
            </Button>
          </div>
        )}

        {!status?.enabled && !setupSecret && (
          <Button onClick={startSetup} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {L('2FA’yı etkinleştir', 'Turn on 2FA')}
          </Button>
        )}

        {setupSecret && qrDataUrl && (
          <div className="space-y-3">
            <p className="text-sm">{L('1. Authenticator uygulamanızla QR kodu okutun (veya gizli anahtarı elle girin):', '1. Scan the QR code with your authenticator app (or enter the secret key manually):')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="2FA QR" className="h-44 w-44 rounded border bg-white p-2" />
            <p className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{setupSecret}</p>
            <p className="text-sm">{L('2. Uygulamadaki 6 haneli kodu girin:', '2. Enter the 6-digit code from the app:')}</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="123456"
                className="max-w-[160px]"
              />
              <Button onClick={verifyEnable} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : L('Doğrula ve etkinleştir', 'Verify and turn on')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
