'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Bell, Coins, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KeyValueList, StatusBadge, statusBadgeProps } from '@/components/ds/data';
import { PageHeader, PanelErrorBoundary, PanelPage, SectionCard, SectionTabs, useUrlState } from '@/components/ds/page';
import { InlineError, QueryState, SkeletonDetail } from '@/components/states';
import { ChoiceChips } from '@/components/ds/a11y';
import type { User360 } from '@/lib/admin-users/contract';
import { errorText, fetchUser, notifyUser, setSuspension, usersKeys } from './api';
import { STATUS, TRUST, displayName, fmtDate, fmtNumber, fmtRelative, roleLabel, roleTone } from './format';
import { FormField, ReasonDialog, UserAvatar } from './parts';
import { OverviewTab } from './tabs/overview-tab';
import { AdminKullanicilarText } from './copy';

// Ağır sekmeler yalnız açıldığında yüklenir (ilk boyama: kimlik kartı + genel bakış).
const loading = () => <SkeletonDetail />;
const EconomyTab = dynamic(() => import('./tabs/economy-tab').then((m) => m.EconomyTab), { loading });
const BadgesTab = dynamic(() => import('./tabs/badges-tab').then((m) => m.BadgesTab), { loading });
const FeedbackTab = dynamic(() => import('./tabs/feedback-tab').then((m) => m.FeedbackTab), { loading });
const TrustTab = dynamic(() => import('./tabs/trust-tab').then((m) => m.TrustTab), { loading });
const AccessTab = dynamic(() => import('./tabs/access-tab').then((m) => m.AccessTab), { loading });
const AuditTab = dynamic(() => import('./tabs/audit-tab').then((m) => m.AuditTab), { loading });
const BusinessTab = dynamic(() => import('./tabs/business-tab').then((m) => m.BusinessTab), { loading });

export function User360Screen({ id, initial }: { id: string; initial: User360 | null }) {
  const qc = useQueryClient();
  const url = useUrlState();
  const q = useQuery({ queryKey: usersKeys.detail(id), queryFn: () => fetchUser(id), initialData: initial ?? undefined, staleTime: 15_000 });
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: usersKeys.detail(id) });
  const goTab = (tab: string) => url.set({ tab });

  return (
    <QueryState query={q} skeleton="detail">
      {(u) => {
        const ident = u.identity;
        const locked = ident.status === 'anonymized';
        const tabs = [
          { value: 'genel', label: 'Genel' },
          { value: 'ekonomi', label: 'Ekonomi' },
          { value: 'rozetler', label: 'Rozet ve ödüller', count: u.counts.badges + u.counts.rewards },
          { value: 'geri-bildirim', label: 'Geri bildirimler', count: u.counts.feedbacks },
          { value: 'guven', label: 'Güven ve aktivite', count: u.trust.openSuspicious || undefined },
          ...(u.dealer ? [{ value: 'isletme', label: 'İşletme' }] : []),
          { value: 'erisim', label: 'Erişim' },
          { value: 'denetim', label: 'Denetim' },
        ];
        return (
          <PanelPage
            register="ops"
            asideWidth="md"
            asideOnMobile="before"
            header={
              <PageHeader
                back={{ href: '/admin/users', label: 'Kullanıcılar' }}
                title={displayName(ident)}
                description={ident.email}
                icon={<UserRound />}
                meta={
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge size="sm" tone={roleTone(ident.role)} icon={null} label={roleLabel(ident.role)} />
                    <StatusBadge size="sm" {...statusBadgeProps(STATUS, ident.status)} />
                    {ident.isDemo ? <StatusBadge size="sm" tone="neutral" label="Demo hesabı" /> : null}
                    {u.pendingElevation ? <StatusBadge size="sm" tone="warning" label="Yönetici yükseltmesi onay bekliyor" /> : null}
                  </div>
                }
              />
            }
            aside={
              <SectionCard title="Kimlik" density="compact">
                <div className="flex items-center gap-3">
                  <UserAvatar name={ident.name} email={ident.email} image={ident.image} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{displayName(ident)}</p>
                    <p className="truncate text-sm text-fg-muted">{ident.email}</p>
                  </div>
                </div>
                <KeyValueList
                  className="mt-4"
                  items={[
                    { label: 'Kimlik', value: ident.id, copyValue: ident.id, mono: true },
                    { label: 'Kayıt', value: fmtDate(ident.createdAt) },
                    { label: 'Son görülme', value: u.security.lastSeenAt ? fmtRelative(u.security.lastSeenAt) : 'Kayıt yok' },
                    { label: 'E-posta', value: ident.emailVerifiedAt ? `Doğrulandı · ${fmtDate(ident.emailVerifiedAt)}` : 'Doğrulanmadı' },
                    { label: 'Telefon', value: ident.phone },
                    { label: 'Güven', value: <StatusBadge size="sm" {...statusBadgeProps(TRUST, u.trust.tier)} label={`${statusBadgeProps(TRUST, u.trust.tier).label} · ${u.trust.score}`} /> },
                    { label: 'Bakiye', value: `${fmtNumber(u.gamification.points)} puan` },
                    ...(u.staff ? [{ label: 'Bağlı işletme', value: u.staff.dealerName ?? '—', hint: u.staff.isActive ? u.staff.jobTitle ?? undefined : 'Personel kaydı pasif' }] : []),
                    ...(ident.suspendedAt ? [{ label: 'Askıya alındı', value: fmtDate(ident.suspendedAt), hint: ident.suspendedReason ?? undefined }] : []),
                  ]}
                />
                {!locked && !u.isSelf ? (
                  <div className="mt-4 grid gap-2">
                    <Button variant="outline" className="min-h-11 justify-start" onClick={() => setNotifyOpen(true)}>
                      <Bell className="h-4 w-4" aria-hidden />
                      Bildirim gönder
                    </Button>
                    <Button variant="outline" className="min-h-11 justify-start" onClick={() => goTab('ekonomi')}>
                      <Coins className="h-4 w-4" aria-hidden />
                      Bakiye düzelt
                    </Button>
                    {ident.status === 'suspended' ? (
                      <Button variant="outline" className="min-h-11 justify-start" onClick={() => setSuspendOpen(true)}>
                        <Sparkles className="h-4 w-4" aria-hidden />
                        Askıdan çıkar
                      </Button>
                    ) : ident.role !== 'ADMIN' ? (
                      <Button variant="outline" className="min-h-11 justify-start text-warning" onClick={() => setSuspendOpen(true)}>
                        <Ban className="h-4 w-4" aria-hidden />
                        Askıya al
                      </Button>
                    ) : null}
                    <Button variant="ghost" className="min-h-11 justify-start" onClick={() => goTab('erisim')}>
                      <ShieldCheck className="h-4 w-4" aria-hidden />
                      Erişim ve güvenlik
                    </Button>
                  </div>
                ) : null}
                {locked ? (
                  <p className="mt-4 rounded-lg border border-subtle bg-surface-2 p-3 text-sm text-fg-muted">
                    Bu hesap {fmtDate(ident.anonymizedAt)} tarihinde KVKK kapsamında anonimleştirildi; yalnız geçmiş kayıtlar görüntülenir.
                  </p>
                ) : null}
                {u.isSelf ? (
                  <p className="mt-4 rounded-lg border border-subtle bg-surface-2 p-3 text-sm text-fg-muted">
                    Bu sizin hesabınız. Kendi rolünüz, bakiyeniz ve oturumlarınız buradan değiştirilemez.
                  </p>
                ) : null}
              </SectionCard>
            }
          >
            <SectionTabs ariaLabel="Kullanıcı bölümleri" defaultValue="genel" tabs={tabs} resetKeys={['page']}>
              {(tab) => (
                <PanelErrorBoundary resetKeys={[tab]}>
                  {tab === 'ekonomi' ? (
                    <EconomyTab user={u} onChanged={invalidate} />
                  ) : tab === 'rozetler' ? (
                    <BadgesTab user={u} onChanged={invalidate} />
                  ) : tab === 'geri-bildirim' ? (
                    <FeedbackTab userId={u.identity.id} />
                  ) : tab === 'guven' ? (
                    <TrustTab user={u} />
                  ) : tab === 'isletme' && u.dealer ? (
                    <BusinessTab user={u} onChanged={invalidate} />
                  ) : tab === 'erisim' ? (
                    <AccessTab user={u} onChanged={invalidate} />
                  ) : tab === 'denetim' ? (
                    <AuditTab userId={u.identity.id} />
                  ) : (
                    <OverviewTab user={u} onGoTab={goTab} />
                  )}
                </PanelErrorBoundary>
              )}
            </SectionTabs>

            <NotifyDialog userId={u.identity.id} open={notifyOpen} onOpenChange={setNotifyOpen} />
            <ReasonDialog
              open={suspendOpen}
              onOpenChange={setSuspendOpen}
              title={ident.status === 'suspended' ? 'Hesap askıdan çıkarılsın mı?' : 'Hesap askıya alınsın mı?'}
              description={
                ident.status === 'suspended'
                  ? 'Kullanıcı yeniden giriş yapabilir. Not denetim kaydına yazılır.'
                  : 'Kullanıcı giriş yapamaz, açık oturumları hemen düşer. Veri silinmez; işlem geri alınabilir.'
              }
              label={ident.status === 'suspended' ? 'Not' : 'Askıya alma gerekçesi'}
              confirmLabel={ident.status === 'suspended' ? 'Askıdan çıkar' : 'Askıya al'}
              onConfirm={async (reason) => {
                await setSuspension(u.identity.id, ident.status === 'suspended' ? { action: 'unsuspend', reason } : { action: 'suspend', reason });
                toast.success(ident.status === 'suspended' ? 'Hesap askıdan çıkarıldı.' : 'Hesap askıya alındı; oturumlar kapatıldı.');
                await qc.invalidateQueries({ queryKey: usersKeys.all });
              }}
            />
          </PanelPage>
        );
      }}
    </QueryState>
  );
}

function NotifyDialog({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'warning'>('info');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = title.trim().length >= 2 && message.trim().length >= 2;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (o) {
          setTitle('');
          setMessage('');
          setType('info');
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || busy) return;
            setBusy(true);
            setError(null);
            try {
              await notifyUser(userId, { title: title.trim(), message: message.trim(), type });
              toast.success('Bildirim gönderildi.');
              onOpenChange(false);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle><AdminKullanicilarText k="inAppNotice" /></DialogTitle>
            <DialogDescription><AdminKullanicilarText k="noticeHint" /></DialogDescription>
          </DialogHeader>
          <FormField htmlFor="notify-title" label="Başlık" hint={`${title.length}/80`}>
            <Input id="notify-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField htmlFor="notify-message" label="Mesaj" hint={`${message.length}/500`}>
            <Textarea id="notify-message" value={message} maxLength={500} rows={4} onChange={(e) => setMessage(e.target.value)} required />
          </FormField>
          <div className="space-y-2">
            <p className="text-sm font-medium text-fg" id="notify-type">
              Tür
            </p>
            <ChoiceChips
              aria-labelledby="notify-type"
              value={type}
              onChange={(v) => setType((v as typeof type) || 'info')}
              options={[
                { value: 'info', label: 'Bilgi' },
                { value: 'success', label: 'Olumlu' },
                { value: 'warning', label: 'Uyarı' },
              ]}
            />
          </div>
          {valid ? (
            <div className="rounded-lg border border-subtle bg-surface-2 p-3" aria-label="Önizleme">
              <p className="text-xs text-fg-muted"><AdminKullanicilarText k="preview" /></p>
              <p className="font-medium text-fg">{title}</p>
              <p className="whitespace-pre-line text-sm text-fg-muted">{message}</p>
            </div>
          ) : null}
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
              <Mail className="h-4 w-4" aria-hidden />
              {busy ? 'Gönderiliyor…' : 'Gönder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
