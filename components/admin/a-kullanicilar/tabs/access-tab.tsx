'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, LogOut, Mail, ShieldCheck, UserCog, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyValueList, StatusBadge } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ConfirmAction, InlineError } from '@/components/states';
import type { User360 } from '@/lib/admin-users/contract';
import { anonymize, changeRole, decideElevation, errorText, previewAnonymize, revokeSessions, sendAccessLink, usersKeys } from '../api';
import { fmtDateTime, fmtNumber, fmtRelative, roleLabel } from '../format';
import { FormField, fieldError } from '../parts';
import { AdminKullanicilarText } from '../copy';

export function AccessTab({ user: u, onChanged }: { user: User360; onChanged: () => void }) {
  const qc = useQueryClient();
  const locked = u.identity.status === 'anonymized';
  const refreshAll = async () => {
    onChanged();
    await qc.invalidateQueries({ queryKey: usersKeys.all });
  };
  return (
    <div className="space-y-6">
      {u.pendingElevation ? <PendingElevation user={u} onDone={refreshAll} /> : null}
      {!locked && !u.isSelf ? <RoleCard user={u} onDone={refreshAll} /> : null}

      <SectionCard title="Oturum ve giriş" icon={<KeyRound />}>
        <KeyValueList
          items={[
            { label: 'İki adımlı doğrulama', value: u.security.twoFactorEnabled ? 'Açık' : 'Kapalı' },
            { label: 'Şifre', value: u.security.hasPassword ? 'Belirlenmiş' : 'Yok (davet bekliyor ya da sosyal giriş)' },
            { label: 'Oturum sürümü', value: String(u.security.sessionVersion), hint: 'Her oturum sonlandırmada artar; eski oturumlar geçersizleşir.' },
            { label: 'Son görülme', value: u.security.lastSeenAt ? `${fmtRelative(u.security.lastSeenAt)} · ${fmtDateTime(u.security.lastSeenAt)}` : 'Kayıt yok' },
          ]}
        />
        {!locked && !u.isSelf ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <ConfirmAction
              tone="warning"
              trigger={
                <Button variant="outline" className="min-h-11">
                  <LogOut className="h-4 w-4" aria-hidden />
                  Tüm oturumları sonlandır
                </Button>
              }
              title="Kullanıcının tüm oturumları kapatılsın mı?"
              description="Bütün cihazlardaki açık oturumlar hemen geçersizleşir; kullanıcı yeniden giriş yapmalıdır. Hesap askıya alınmaz."
              confirmLabel="Oturumları kapat"
              onConfirm={async () => {
                await revokeSessions(u.identity.id);
                toast.success('Tüm oturumlar sonlandırıldı.');
                await refreshAll();
              }}
            />
            {u.identity.status === 'active' ? (
              <ConfirmAction
                tone="brand"
                trigger={
                  <Button variant="outline" className="min-h-11">
                    <Mail className="h-4 w-4" aria-hidden />
                    {u.identity.emailVerifiedAt ? 'Şifre sıfırlama bağlantısı gönder' : 'Doğrulama bağlantısı gönder'}
                  </Button>
                }
                title={u.identity.emailVerifiedAt ? 'Şifre sıfırlama bağlantısı gönderilsin mi?' : 'Doğrulama bağlantısı gönderilsin mi?'}
                description={`Bağlantı yalnız ${u.identity.email} adresine gider${u.identity.emailVerifiedAt ? ' ve 1 saat geçerlidir' : ''}. Yönetici şifreyi görmez.`}
                confirmLabel="Gönder"
                onConfirm={async () => {
                  const r = await sendAccessLink(u.identity.id);
                  toast.success(r.kind === 'reset' ? 'Şifre sıfırlama bağlantısı gönderildi.' : 'Doğrulama bağlantısı gönderildi.');
                  onChanged();
                }}
              />
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {u.team ? (
        <SectionCard title="İç ekip" icon={<ShieldCheck />} density="compact">
          <p className="text-sm text-fg-muted">
            Departman ve ekip rolü İç Ekip modülünde yönetilir.{' '}
            <Link href="/admin/ekip" className="text-brand underline-offset-4 hover:underline">
              Ekibe git
            </Link>
          </p>
        </SectionCard>
      ) : null}

      {!locked && !u.isSelf ? <AnonymizeCard user={u} onDone={refreshAll} /> : null}
    </div>
  );
}

function RoleCard({ user: u, onDone }: { user: User360; onDone: () => Promise<void> }) {
  const id = useId();
  const current = u.identity.role;
  const options = (['CUSTOMER', 'DEALER', 'ADMIN'] as const).filter((r) => r !== current);
  const [role, setRole] = useState<string>('');
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toAdmin = role === 'ADMIN';
  const lastAdmin = current === 'ADMIN' && u.activeAdminCount <= 1;
  const phraseOk = !toAdmin || phrase.trim().toLowerCase() === u.identity.email.toLowerCase();
  const valid = !!role && reason.trim().length >= 5 && phraseOk && !lastAdmin && !u.pendingElevation;
  return (
    <SectionCard title="Rol" icon={<UserCog />} description="Rol değişikliği açık oturumları hemen düşürür. Yönetici yükseltmesi ikinci bir yöneticinin onayını ister.">
      <p className="mb-3 text-sm text-fg">
        Mevcut rol: <strong>{roleLabel(current)}</strong>
        {current === 'STAFF' ? ' — personel kaydı yeni rolde pasifleşir (silinmez).' : ''}
      </p>
      {lastAdmin ? <InlineError tone="warning"><AdminKullanicilarText k="lastAdmin" /></InlineError> : null}
      {u.pendingElevation ? <InlineError tone="info"><AdminKullanicilarText k="pendingUpgrade" /></InlineError> : null}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          setError(null);
          try {
            const r = await changeRole(u.identity.id, { role, reason: reason.trim(), confirmPhrase: toAdmin ? phrase.trim() : undefined });
            toast.success(r.status === 'pending_approval' ? 'Yükseltme talebi kaydedildi; başka bir yöneticinin onayı bekleniyor.' : `Rol ${roleLabel(r.role)} olarak değiştirildi.`);
            setRole('');
            setReason('');
            setPhrase('');
            await onDone();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormField htmlFor={`${id}-role`} label="Yeni rol" error={fieldError(error, 'role')} hint="Personel rolü yalnız bayinin davetiyle verilir.">
          <Select value={role} onValueChange={setRole} disabled={lastAdmin || !!u.pendingElevation}>
            <SelectTrigger id={`${id}-role`} className="min-h-11">
              <SelectValue placeholder="Seçin" />
            </SelectTrigger>
            <SelectContent>
              {options.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField htmlFor={`${id}-why`} label="Gerekçe" error={fieldError(error, 'reason')} hint="En az 5 karakter; denetime yazılır.">
          <Textarea id={`${id}-why`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        {toAdmin ? (
          <FormField
            htmlFor={`${id}-phrase`}
            label={`Onay için e-postayı yazın: ${u.identity.email}`}
            error={fieldError(error, 'confirmPhrase')}
            hint="Yönetici tam yetkilidir. Talep, sizden farklı bir yöneticinin onayıyla uygulanır (24 saat geçerli)."
          >
            <Input id={`${id}-phrase`} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
          </FormField>
        ) : null}
        {error && !fieldError(error, 'confirmPhrase') ? <InlineError>{errorText(error)}</InlineError> : null}
        <div className="flex justify-end">
          <Button type="submit" className="min-h-11" variant={toAdmin ? 'destructive' : 'default'} disabled={!valid || busy} aria-busy={busy}>
            {busy ? 'Kaydediliyor…' : toAdmin ? 'Yükseltme talebi oluştur' : 'Rolü değiştir'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function PendingElevation({ user: u, onDone }: { user: User360; onDone: () => Promise<void> }) {
  const p = u.pendingElevation!;
  const mine = p.requesterId === u.viewerId;
  return (
    <SectionCard title="Yönetici yükseltmesi onay bekliyor" tone="warning" stripe icon={<ShieldCheck />}>
      <KeyValueList
        items={[
          { label: 'Talep eden', value: p.requesterLabel },
          { label: 'Tarih', value: fmtDateTime(p.requestedAt) },
          { label: 'Gerekçe', value: p.reason || '—' },
        ]}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {!mine && !u.isSelf ? (
          <ConfirmAction
            tone="danger"
            trigger={<Button className="min-h-11"><AdminKullanicilarText k="approveAdmin" /></Button>}
            title={`${u.identity.email} yönetici yapılsın mı?`}
            description="Kişi platformun tüm yönetim uçlarına erişir. Onayınız ikinci imza olarak denetime yazılır."
            confirmPhrase={u.identity.email}
            confirmLabel="Onayla"
            onConfirm={async () => {
              await decideElevation(u.identity.id, { requestId: p.requestId, decision: 'approve' });
              toast.success('Yükseltme onaylandı.');
              await onDone();
            }}
          />
        ) : (
          <StatusBadge tone="info" label={mine ? 'Kendi talebinizi onaylayamazsınız' : 'Kendi yükseltmenizi onaylayamazsınız'} />
        )}
        <ConfirmAction
          tone="warning"
          trigger={
            <Button variant="outline" className="min-h-11">
              {mine ? 'Talebi geri çek' : 'Reddet'}
            </Button>
          }
          title={mine ? 'Talep geri çekilsin mi?' : 'Yükseltme reddedilsin mi?'}
          confirmLabel={mine ? 'Geri çek' : 'Reddet'}
          onConfirm={async () => {
            await decideElevation(u.identity.id, { requestId: p.requestId, decision: 'reject' });
            toast.success(mine ? 'Talep geri çekildi.' : 'Yükseltme reddedildi.');
            await onDone();
          }}
        />
      </div>
    </SectionCard>
  );
}

function AnonymizeCard({ user: u, onDone }: { user: User360; onDone: () => Promise<void> }) {
  return (
    <SectionCard title="KVKK anonimleştirmesi" tone="danger" stripe icon={<UserX />}>
      <p className="text-sm text-fg-muted">
        Kalıcı silme yoktur. Anonimleştirme ad, e-posta, telefon, adres, şifre ve oturumları geri döndürülemez biçimde kaldırır; denetim izi, puan
        geçmişi ve istatistikler korunur. Veri sahibi talepleri için{' '}
        <Link href="/admin/privacy" className="text-brand underline-offset-4 hover:underline">
          KVKK talepleri
        </Link>{' '}
        akışını kullanın.
      </p>
      <ConfirmAction
        tone="danger"
        trigger={
          <Button variant="outline" className="mt-3 min-h-11 text-danger">
            Hesabı anonimleştir
          </Button>
        }
        title="Hesap anonimleştirilsin mi?"
        loadImpact={async () => {
          const r = await previewAnonymize(u.identity.id);
          const blockers = r.impact.blockers ?? [];
          return {
            items: r.impact.items.map((i) => ({ label: i.label, value: fmtNumber(i.value), emphasis: i.emphasis })),
            warning: blockers.length ? `Engelleyen durum: ${blockers.join(' ')}` : r.impact.warning,
          };
        }}
        confirmPhrase={u.identity.email}
        confirmLabel="Anonimleştir"
        onConfirm={async () => {
          await anonymize(u.identity.id, u.identity.email);
          toast.success('Hesap anonimleştirildi.');
          await onDone();
        }}
      />
    </SectionCard>
  );
}
