'use client';

import { useEffect, useId, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Eye, EyeOff, KeyRound, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, EmptyState, InlineError } from '@/components/states';
import type { SecurityState } from '@/lib/dealer-settings/contract';
import { SETTINGS_KEY, callLegacy, errorText, revokeSessions } from './api';
import { PROVIDER_LABEL, SECURITY_EVENT_LABEL, fmtDate, fmtDateTime, relativeDays } from './format';
import { KeyValue } from './ui';

export function SecurityTab({ data }: { data: SecurityState }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const pwAge = now ? relativeDays(data.lastPasswordChangeAt, now) : null;

  return (
    <div className="space-y-6">
      <SectionCard title="Güvenlik durumu">
        <dl className="divide-y divide-subtle">
          <KeyValue label="İki adımlı doğrulama">
            <StatusBadge label={data.twoFactor.enabled ? 'Açık' : 'Kapalı'} tone={data.twoFactor.enabled ? 'success' : 'warning'} size="sm" />
          </KeyValue>
          <KeyValue label="Şifre">
            {data.hasPassword ? (data.lastPasswordChangeAt ? `Son değişiklik ${pwAge ?? fmtDate(data.lastPasswordChangeAt)}` : 'Tanımlı') : 'Tanımlı değil'}
          </KeyValue>
          <KeyValue label="Bağlı giriş">
            {data.providers.length ? data.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(', ') : 'Yalnız e-posta ve şifre'}
          </KeyValue>
          <KeyValue label="Bu oturum">
            {[data.currentDevice ?? 'Bu tarayıcı', data.sessionStartedAt ? `giriş ${fmtDateTime(data.sessionStartedAt)}` : null].filter(Boolean).join(' · ')}
          </KeyValue>
        </dl>
      </SectionCard>

      <PasswordCard hasPassword={data.hasPassword} />
      <TwoFactorCard state={data.twoFactor} />
      <SessionsCard lastRevokedAt={data.lastSessionsRevokedAt} />

      <SectionCard title="Son güvenlik etkinliği" description="Hesabınızda yapılan son önemli değişiklikler.">
        {data.events.length === 0 ? (
          <EmptyState compact title="Henüz kayıt yok" description="Şifre, oturum ve ayar değişiklikleri burada listelenir." headingLevel="p" />
        ) : (
          <ol className="divide-y divide-subtle">
            {data.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="qx-small font-medium text-fg">{SECURITY_EVENT_LABEL[e.action] ?? e.action}</span>
                <span className="qx-caption text-fg-muted">
                  {fmtDateTime(e.at)}
                  {e.device ? ` · ${e.device}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

// ───────────────────────────── Şifre ─────────────────────────────

function strength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-ZÇĞİÖŞÜ]/.test(pw) && /[a-zçğıöşü]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(pw)) s++;
  const label = ['Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'][s];
  return { score: s as 0 | 1 | 2 | 3 | 4, label };
}

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = strength(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 8;
  const canSubmit = (!hasPassword || current.length > 0) && next.length >= 8 && next.length <= 128 && next === confirm && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (hasPassword) {
        await callLegacy('/api/user/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      } else {
        await callLegacy('/api/user/initial-password', { method: 'POST', body: JSON.stringify({ newPassword: next }) });
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success(hasPassword ? 'Şifreniz güncellendi. Diğer cihazlardaki oturumlar kapatıldı.' : 'Şifreniz oluşturuldu.');
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    } catch (err) {
      setError(errorText(err, 'Şifre güncellenemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const barTone = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'][st.score];

  return (
    <SectionCard
      title={hasPassword ? 'Şifreyi değiştir' : 'Şifre oluştur'}
      description={
        hasPassword
          ? 'Değiştirince diğer bütün cihazlardaki oturumlarınız kapanır; bu tarayıcıda oturumunuz sürer.'
          : 'Google gibi bir sağlayıcıyla giriş yapıyorsunuz. Şifre oluşturursanız e-posta ile de giriş yapabilirsiniz.'
      }
    >
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-cur`}>Mevcut şifre</Label>
            <Input id={`${id}-cur`} type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-new`}>Yeni şifre</Label>
          <div className="relative">
            <Input
              id={`${id}-new`}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={next}
              maxLength={128}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby={`${id}-str`}
              aria-invalid={tooShort || undefined}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={show ? 'Şifreleri gizle' : 'Şifreleri göster'}
              aria-pressed={show}
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <div id={`${id}-str`} aria-live="polite" className="space-y-1">
            {next.length > 0 && (
              <>
                <div className="flex gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i < st.score ? barTone : 'bg-surface-muted'}`} />
                  ))}
                </div>
                <p className="qx-caption text-fg-muted">Güç: {st.label}{tooShort ? ' · en az 8 karakter' : ''}</p>
              </>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-cfm`}>Yeni şifre (tekrar)</Label>
          <Input
            id={`${id}-cfm`}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            maxLength={128}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? `${id}-mm` : undefined}
          />
          {mismatch && (
            <p id={`${id}-mm`} className="qx-caption text-danger">
              Şifreler eşleşmiyor.
            </p>
          )}
        </div>
        {error && <InlineError variant="banner">{error}</InlineError>}
        <Button type="submit" disabled={!canSubmit}>
          <KeyRound className="h-4 w-4" aria-hidden />
          {busy ? 'Kaydediliyor…' : hasPassword ? 'Şifreyi güncelle' : 'Şifre oluştur'}
        </Button>
      </form>
    </SectionCard>
  );
}

// ───────────────────────────── 2FA ─────────────────────────────

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n');
  return (
    <div className="space-y-3 rounded-card border border-warning-border bg-warning-subtle/40 p-4">
      <p className="qx-small font-semibold text-fg">Kurtarma kodlarınız — yalnız şimdi gösterilir</p>
      <p className="qx-caption text-fg-muted">Telefonunuza erişemezseniz bu kodlardan biriyle giriş yapabilirsiniz. Her kod bir kez kullanılır.</p>
      <ul className="qx-num grid grid-cols-2 gap-1 font-mono text-sm text-fg">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(text)
              .then(() => toast.success('Kodlar kopyalandı.'))
              .catch(() => toast.error('Kopyalanamadı.'))
          }
        >
          <Copy className="h-4 w-4" aria-hidden />
          Kopyala
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`Qratex kurtarma kodları\n\n${text}\n`], { type: 'text/plain;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'qratex-kurtarma-kodlari.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-4 w-4" aria-hidden />
          İndir
        </Button>
      </div>
    </div>
  );
}

function TwoFactorCard({ state }: { state: SecurityState['twoFactor'] }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [setup, setSetup] = useState<{ secret: string; qr: string | null } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<'disable' | 'regen' | null>(null);
  const [dialogCode, setDialogCode] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await callLegacy<{ secret: string; otpauthUri: string }>('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ action: 'setup' }) });
      let qr: string | null = null;
      try {
        const QR = (await import('qrcode')).default;
        qr = await QR.toDataURL(out.otpauthUri, { margin: 1, width: 200 });
      } catch {
        qr = null;
      }
      setSetup({ secret: out.secret, qr });
    } catch (e) {
      setError(errorText(e, 'Kurulum başlatılamadı.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('6 haneli kodu girin.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await callLegacy<{ recoveryCodes?: string[] }>('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ action: 'verify', code }) });
      setSetup(null);
      setCode('');
      setCodes(out.recoveryCodes ?? null);
      toast.success('İki adımlı doğrulama açıldı.');
      await refresh();
    } catch (err) {
      setError(errorText(err, 'Kod doğrulanamadı.'));
    } finally {
      setBusy(false);
    }
  };

  const runDialog = async () => {
    if (!/^\d{6}$/.test(dialogCode.trim()) && !/^[A-Za-z0-9-]{8,}$/.test(dialogCode.trim())) {
      setError('Doğrulama kodunu girin.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (dialog === 'disable') {
        await callLegacy('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ action: 'disable', code: dialogCode.trim() }) });
        toast.success('İki adımlı doğrulama kapatıldı.');
        setCodes(null);
      } else {
        const out = await callLegacy<{ recoveryCodes?: string[] }>('/api/auth/2fa', {
          method: 'POST',
          body: JSON.stringify({ action: 'recovery-codes', code: dialogCode.trim() }),
        });
        setCodes(out.recoveryCodes ?? null);
        toast.success('Yeni kurtarma kodları üretildi.');
      }
      setDialog(null);
      setDialogCode('');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'İşlem tamamlanamadı.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="İki adımlı doğrulama"
      description="Girişte şifrenize ek olarak doğrulama uygulamasındaki (Google Authenticator, Authy…) 6 haneli kod istenir."
      actions={<StatusBadge label={state.enabled ? 'Açık' : 'Kapalı'} tone={state.enabled ? 'success' : 'warning'} size="sm" />}
    >
      <div className="space-y-4">
        {state.enabled ? (
          <>
            <p className="qx-small text-fg-muted">
              {state.since ? `${fmtDate(state.since)} tarihinden beri açık. ` : ''}Kalan kurtarma kodu: <span className="qx-num font-semibold text-fg">{state.remainingRecoveryCodes}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => { setError(null); setDialog('regen'); }}>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Yeni kurtarma kodları üret
              </Button>
              <Button type="button" variant="ghost" className="text-danger" onClick={() => { setError(null); setDialog('disable'); }}>
                <ShieldOff className="h-4 w-4" aria-hidden />
                Kapat
              </Button>
            </div>
          </>
        ) : setup ? (
          <form onSubmit={verify} className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]" noValidate>
            {setup.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={setup.qr} alt="Doğrulama uygulamasıyla okutulacak kurulum QR kodu" className="h-44 w-44 rounded-control border border-subtle bg-white p-1" />
            ) : null}
            <div className="min-w-0 space-y-3">
              <p className="qx-small text-fg-muted">1. Uygulamada “hesap ekle” deyip QR&apos;ı okutun ya da anahtarı elle girin:</p>
              <code className="qx-num block break-all rounded-control bg-surface-muted px-3 py-2 font-mono text-sm text-fg">{setup.secret}</code>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-code`}>2. Uygulamadaki 6 haneli kod</Label>
                <Input
                  id={`${id}-code`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="qx-num max-w-40 tracking-widest"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || code.length !== 6}>
                  {busy ? 'Doğrulanıyor…' : 'Doğrula ve aç'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setSetup(null); setCode(''); }}>
                  Vazgeç
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <Button type="button" onClick={() => void start()} disabled={busy}>
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {busy ? 'Hazırlanıyor…' : 'İki adımlı doğrulamayı aç'}
          </Button>
        )}
        {error && !dialog && <InlineError variant="banner">{error}</InlineError>}
        {codes && codes.length > 0 && <RecoveryCodes codes={codes} />}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) { setDialog(null); setDialogCode(''); setError(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialog === 'disable' ? 'İki adımlı doğrulama kapatılsın mı?' : 'Yeni kurtarma kodları'}</DialogTitle>
            <DialogDescription>
              {dialog === 'disable'
                ? 'Hesabınız yalnız şifreyle korunur. Onaylamak için uygulamadaki kodu ya da bir kurtarma kodunu girin.'
                : 'Eski kurtarma kodları geçersiz olur. Onaylamak için uygulamadaki kodu girin.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runDialog();
            }}
            className="space-y-3"
          >
            <Label htmlFor={`${id}-dlg`}>Doğrulama kodu</Label>
            <Input id={`${id}-dlg`} autoComplete="one-time-code" value={dialogCode} onChange={(e) => setDialogCode(e.target.value)} autoFocus />
            {error && <InlineError variant="field">{error}</InlineError>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Vazgeç
              </Button>
              <Button type="submit" variant={dialog === 'disable' ? 'destructive' : 'default'} disabled={busy || dialogCode.trim().length < 6}>
                {busy ? 'Bekleyin…' : dialog === 'disable' ? 'Kapat' : 'Kodları üret'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ───────────────────────────── Oturumlar ─────────────────────────────

function SessionsCard({ lastRevokedAt }: { lastRevokedAt: string | null }) {
  const queryClient = useQueryClient();

  const run = async (scope: 'others' | 'all') => {
    try {
      const out = await revokeSessions(scope);
      if (scope === 'all' || !out.reissued) {
        toast.success('Oturumlar kapatıldı. Yeniden giriş yapın.');
        await signOut({ callbackUrl: '/auth/login' });
        return;
      }
      toast.success('Diğer cihazlardaki oturumlar kapatıldı.');
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    } catch (e) {
      toast.error(errorText(e, 'Oturumlar kapatılamadı.'));
      throw e;
    }
  };

  return (
    <SectionCard
      title="Oturumlar"
      description={lastRevokedAt ? `En son ${fmtDateTime(lastRevokedAt)} tarihinde oturumlar kapatıldı.` : 'Kaybolan bir cihaz ya da paylaşılan bilgisayar için oturumları kapatın.'}
    >
      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          trigger={
            <Button type="button" variant="outline">
              <LogOut className="h-4 w-4" aria-hidden />
              Diğer cihazlardan çık
            </Button>
          }
          title="Diğer cihazlardaki oturumlar kapatılsın mı?"
          description="Bu tarayıcı dışındaki tüm cihazlarda yeniden giriş gerekir."
          tone="warning"
          confirmLabel="Diğerlerinden çık"
          irreversibleNote={false}
          onConfirm={() => run('others')}
        />
        <ConfirmAction
          trigger={
            <Button type="button" variant="ghost" className="text-danger">
              Her yerden çık
            </Button>
          }
          title="Tüm oturumlar kapatılsın mı?"
          description="Bu tarayıcı dahil her yerde oturumunuz kapanır."
          tone="danger"
          confirmLabel="Her yerden çık"
          irreversibleNote={false}
          onConfirm={() => run('all')}
        />
      </div>
    </SectionCard>
  );
}
