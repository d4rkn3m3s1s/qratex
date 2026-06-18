'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ShieldOff, Loader2, Copy } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type Status = { enabled: boolean; remainingRecoveryCodes: number };

/**
 * 2FA (TOTP) ayar kartı — kurulum (QR + doğrula), kurtarma kodları, devre dışı.
 * /api/auth/2fa'ya bağlı. Hesap güvenlik sekmesine gömülür.
 */
export function TwoFactorSettings() {
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
      if (!res.ok) throw new Error(data.error || 'Kurulum başlatılamadı');
      setSetupSecret(data.secret);
      setQrDataUrl(await QRCode.toDataURL(data.otpauthUri));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kurulum başlatılamadı');
    } finally {
      setLoading(false);
    }
  };

  const verifyEnable = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('6 haneli kodu girin');
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
      if (!res.ok) throw new Error(data.error || 'Doğrulama başarısız');
      toast.success('2FA etkinleştirildi');
      setRecoveryCodes(data.recoveryCodes ?? null);
      setSetupSecret(null);
      setQrDataUrl(null);
      setCode('');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Doğrulama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    const c = prompt('2FA kapatmak için authenticator kodunuzu girin:');
    if (!c) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', code: c.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Devre dışı bırakılamadı');
      toast.success('2FA devre dışı bırakıldı');
      setRecoveryCodes(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Devre dışı bırakılamadı');
    } finally {
      setLoading(false);
    }
  };

  const copyCodes = () => {
    if (recoveryCodes) {
      navigator.clipboard.writeText(recoveryCodes.join('\n')).then(() => toast.success('Kurtarma kodları kopyalandı'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {status?.enabled ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldOff className="h-5 w-5 text-muted-foreground" />}
          İki Adımlı Doğrulama (2FA)
        </CardTitle>
        <CardDescription>
          Authenticator uygulaması (Google Authenticator, Authy vb.) ile hesabınıza ek güvenlik katmanı.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Kurtarma kodları (yalnızca etkinleştirmeden/yenilemeden hemen sonra) */}
        {recoveryCodes && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="mb-2 text-sm font-medium">Kurtarma kodlarınız — güvenli bir yere kaydedin (yalnızca bir kez gösterilir):</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <span key={c} className="rounded bg-muted px-2 py-1 text-center">{c}</span>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={copyCodes}>
              <Copy className="h-4 w-4" /> Kopyala
            </Button>
          </div>
        )}

        {status?.enabled && !recoveryCodes && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="text-sm">
              <p className="font-medium text-green-600">2FA aktif ✓</p>
              <p className="text-muted-foreground">Kalan kurtarma kodu: {status.remainingRecoveryCodes}</p>
            </div>
            <Button variant="outline" onClick={disable} disabled={loading}>
              <ShieldOff className="h-4 w-4" /> Devre dışı bırak
            </Button>
          </div>
        )}

        {!status?.enabled && !setupSecret && (
          <Button onClick={startSetup} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            2FA'yi etkinleştir
          </Button>
        )}

        {setupSecret && qrDataUrl && (
          <div className="space-y-3">
            <p className="text-sm">1. Authenticator uygulamanızla QR kodu okutun (veya secret'ı elle girin):</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="2FA QR" className="h-44 w-44 rounded border bg-white p-2" />
            <p className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{setupSecret}</p>
            <p className="text-sm">2. Uygulamadaki 6 haneli kodu girin:</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="123456"
                className="max-w-[160px]"
              />
              <Button onClick={verifyEnable} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Doğrula ve etkinleştir'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
