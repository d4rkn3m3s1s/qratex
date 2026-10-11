'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Crown, KeyRound, Lock, Unlock, Pencil, Swords, Trash2, UserMinus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyValueList, StatusBadge, statusBadgeProps, Timeline, type TimelineEvent } from '@/components/ds/data';
import { QueryState, SectionCard } from '@/components/states';
import { AUDIT_ACTION_LABEL, type SquadDetail } from '@/lib/admin-squads/contract';
import { SQUAD_MAX_MEMBERS, SQUAD_NAME_MAX } from '@/lib/squads/rules';
import { fetchSquad, squadAction, squadsKeys } from './api';
import { BATTLE_VIEW, displayName, fmtDate, fmtDateTime, fmtNumber } from './format';
import { FormField, ImpactList, ReasonDialog } from './parts';

type Pending =
  | { kind: 'freeze' }
  | { kind: 'unfreeze' }
  | { kind: 'rename' }
  | { kind: 'clear_description' }
  | { kind: 'regenerate_invite' }
  | { kind: 'remove_member'; userId: string; name: string }
  | { kind: 'transfer_owner'; userId: string; name: string };

export function SquadDetailBody({ id }: { id: string }) {
  const q = useQuery({ queryKey: squadsKeys.detail(id), queryFn: () => fetchSquad(id), staleTime: 15_000 });
  return (
    <QueryState query={q} skeleton="detail" errorKind={q.error && (q.error as { status?: number }).status === 404 ? 'notFound' : undefined}>
      {(d) => <SquadDetailView d={d} />}
    </QueryState>
  );
}

function SquadDetailView({ d }: { d: SquadDetail }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);
  const [newName, setNewName] = useState(d.name);
  const nameId = useId();

  const refresh = () => qc.invalidateQueries({ queryKey: squadsKeys.all });
  const close = () => setPending(null);

  const run = async (body: Parameters<typeof squadAction>[1], success: string) => {
    const r = await squadAction(d.id, body);
    if (!r.changed) toast.info('Değişiklik gerekmedi: klan zaten bu durumda.');
    else toast.success(success + (r.cancelledBattles ? ` · ${r.cancelledBattles} açık savaş iadeli iptal edildi` : ''));
    await refresh();
  };

  const openBattles = d.battles.filter((b) => b.view === 'live' || b.view === 'pending' || b.view === 'overdue');
  const refundable = openBattles.reduce((s, b) => s + (b.rewardFunded && !b.rewardRefunded ? b.rewardPool : 0), 0);

  const events: TimelineEvent[] = d.audit.map((a) => ({
    id: a.id,
    title: AUDIT_ACTION_LABEL[a.action] ?? a.action,
    description: a.reason ?? undefined,
    at: a.createdAt,
    actor: a.actorName ?? undefined,
    tone: a.action === 'SQUAD_FREEZE' ? 'warning' : a.action === 'SQUAD_UNFREEZE' ? 'success' : 'neutral',
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...(d.isFrozen ? { label: 'Dondurulmuş', tone: 'warning' as const, icon: Lock } : { label: 'Etkin', tone: 'success' as const })} />
        <span className="text-sm text-fg-muted">
          {fmtNumber(d.members.length)}/{SQUAD_MAX_MEMBERS} üye · {fmtDate(d.createdAt)} kuruldu
        </span>
      </div>

      {d.freeze ? (
        <p className="rounded-control border border-warning-border bg-warning-subtle p-3 text-sm text-fg" role="status">
          {fmtDateTime(d.freeze.at)} tarihinde {d.freeze.by ?? 'bir yönetici'} tarafından donduruldu.
          {d.freeze.reason ? <> Gerekçe: {d.freeze.reason}</> : null}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {d.isFrozen ? (
          <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => setPending({ kind: 'unfreeze' })}>
            <Unlock className="h-4 w-4" aria-hidden />
            Dondurmayı kaldır
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="min-h-11 text-warning sm:min-h-9" onClick={() => setPending({ kind: 'freeze' })}>
            <Lock className="h-4 w-4" aria-hidden />
            Dondur
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          onClick={() => {
            setNewName(d.name);
            setPending({ kind: 'rename' });
          }}
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Yeniden adlandır
        </Button>
        <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setPending({ kind: 'regenerate_invite' })}>
          <KeyRound className="h-4 w-4" aria-hidden />
          Davet kodunu yenile
        </Button>
        {d.description ? (
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setPending({ kind: 'clear_description' })}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Sloganı kaldır
          </Button>
        ) : null}
      </div>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          {
            label: 'Lider',
            value: (
              <Link href={`/admin/users/${d.owner.id}`} className="underline-offset-4 hover:underline focus-visible:underline">
                {displayName(d.owner)}
              </Link>
            ),
            hint: d.owner.email,
          },
          { label: 'Davet kodu', value: d.inviteCode, mono: true, copyValue: d.inviteCode },
          { label: 'Klan puanı', value: fmtNumber(d.totalPoints), hint: 'Üyelerin kazandığı puanların klan toplamı' },
          { label: 'Klan gücü', value: fmtNumber(d.treasuryPoints), hint: 'Geri bildirim puanlarından klan payı' },
          { label: 'Savaş sicili', value: `${d.record.wins} G · ${d.record.losses} M · ${d.record.draws} B`, hint: `${d.record.cancelled} iptal` },
          { label: 'Slogan', value: d.description ?? <span className="text-fg-subtle">Yok</span> },
        ]}
      />

      <SectionCard title="Üyeler" icon={<Users />} density="compact" headingLevel="h3">
        <ul className="divide-y divide-subtle" aria-label="Klan üyeleri">
          {d.members.map((mb) => (
            <li key={mb.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link href={`/admin/users/${mb.userId}`} className="block truncate font-medium text-fg underline-offset-4 hover:underline focus-visible:underline">
                  {displayName(mb)}
                  {mb.isOwner ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-warning">
                      <Crown className="h-3.5 w-3.5" aria-hidden />
                      Lider
                    </span>
                  ) : null}
                </Link>
                <p className="truncate text-xs text-fg-muted">
                  {fmtNumber(mb.points)} puan · {fmtDate(mb.joinedAt)} katıldı
                </p>
              </div>
              {!mb.isOwner ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 sm:min-h-9"
                    aria-label={`${displayName(mb)} kişisine liderliği devret`}
                    onClick={() => setPending({ kind: 'transfer_owner', userId: mb.userId, name: displayName(mb) })}
                  >
                    <Crown className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Lider yap</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 text-danger sm:min-h-9"
                    aria-label={`${displayName(mb)} kişisini klandan çıkar`}
                    onClick={() => setPending({ kind: 'remove_member', userId: mb.userId, name: displayName(mb) })}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Çıkar</span>
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Son savaşlar"
        icon={<Swords />}
        density="compact"
        headingLevel="h3"
        actions={
          <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
            <Link href={`/admin/squads?tab=battles&squadId=${encodeURIComponent(d.id)}`}>Tümü</Link>
          </Button>
        }
      >
        {d.battles.length === 0 ? (
          <p className="text-sm text-fg-muted">Bu klan henüz bir savaşa girmedi.</p>
        ) : (
          <ul className="divide-y divide-subtle">
            {d.battles.map((b) => {
              const rival = b.squad1.id === d.id ? b.squad2 : b.squad1;
              const mine = b.squad1.id === d.id ? b.squad1Score : b.squad2Score;
              const theirs = b.squad1.id === d.id ? b.squad2Score : b.squad1Score;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/admin/squads?tab=battles&battle=${encodeURIComponent(b.id)}`} className="min-w-0 truncate text-fg underline-offset-4 hover:underline focus-visible:underline">
                    vs {rival.name} · <span className="tabular-nums">{fmtNumber(mine)}–{fmtNumber(theirs)}</span>
                  </Link>
                  <span className="flex items-center gap-2">
                    {b.winnerId ? <span className="text-xs text-fg-muted">{b.winnerId === d.id ? 'Kazandı' : 'Kaybetti'}</span> : null}
                    <StatusBadge size="sm" {...statusBadgeProps(BATTLE_VIEW, b.view)} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Moderasyon geçmişi" density="compact" headingLevel="h3">
        <Timeline events={events} dense timeStyle="datetime" emptyLabel="Bu klan için kayıtlı bir yönetici ya da lider işlemi yok." ariaLabel="Moderasyon geçmişi" />
      </SectionCard>

      <ReasonDialog
        open={pending?.kind === 'freeze'}
        onOpenChange={(o) => !o && close()}
        title={`${d.name} dondurulsun mu?`}
        description="Dondurma gerçekten uygulanır ve geri alınabilir."
        minLength={5}
        tone="danger"
        confirmLabel="Dondur"
        onConfirm={(reason) => run({ action: 'freeze', reason }, 'Klan donduruldu')}
      >
        <ImpactList
          items={[
            'Yeni üye katılamaz, lider klan profilini değiştiremez.',
            'Klan meydan okuyamaz, davet kabul edemez; haftalık hedef ödülü alınamaz.',
            'Klan gücü birikmez; üyelerin kişisel puanları etkilenmez, üyeler ayrılabilir.',
            openBattles.length > 0
              ? `${openBattles.length} açık savaş iptal edilir${refundable > 0 ? `; ${fmtNumber(refundable)} puanlık havuz meydan okuyana iade edilir` : ''}.`
              : 'Açık savaşı yok.',
            'Klan lideri bilgilendirilir; işlem moderasyon geçmişine yazılır.',
          ]}
        />
      </ReasonDialog>

      <ReasonDialog
        open={pending?.kind === 'unfreeze'}
        onOpenChange={(o) => !o && close()}
        title={`${d.name} yeniden etkinleştirilsin mi?`}
        description="Klan üye alabilir, savaşlara katılabilir ve güç biriktirebilir. Lider bilgilendirilir."
        tone="brand"
        confirmLabel="Dondurmayı kaldır"
        onConfirm={(reason) => run({ action: 'unfreeze', reason }, 'Klan yeniden etkin')}
      />

      <ReasonDialog
        open={pending?.kind === 'rename'}
        onOpenChange={(o) => !o && close()}
        title="Klanı yeniden adlandır"
        description="Uygunsuz adlar için. Yeni ad herkese açık sıralamada görünür; lider bilgilendirilir."
        confirmLabel="Adı değiştir"
        extraValid={newName.trim().length >= 3 && newName.trim() !== d.name}
        onConfirm={(reason) => run({ action: 'rename', name: newName.trim(), reason }, 'Klan adı değiştirildi')}
      >
        <FormField htmlFor={nameId} label="Yeni klan adı" hint={`3–${SQUAD_NAME_MAX} karakter; harf, rakam, boşluk ve . _ ' -`}>
          <Input id={nameId} value={newName} maxLength={SQUAD_NAME_MAX} onChange={(e) => setNewName(e.target.value)} className="min-h-11" autoComplete="off" />
        </FormField>
      </ReasonDialog>

      <ReasonDialog
        open={pending?.kind === 'clear_description'}
        onOpenChange={(o) => !o && close()}
        title="Klan sloganı kaldırılsın mı?"
        description={d.description ? `Mevcut slogan: “${d.description}”` : undefined}
        tone="danger"
        confirmLabel="Sloganı kaldır"
        onConfirm={(reason) => run({ action: 'clear_description', reason }, 'Slogan kaldırıldı')}
      />

      <ReasonDialog
        open={pending?.kind === 'regenerate_invite'}
        onOpenChange={(o) => !o && close()}
        title="Davet kodu yenilensin mi?"
        description={`Sızmış kodlar için. Mevcut kod (${d.inviteCode}) hemen geçersiz olur; lider yeni kodu klan sayfasında görür.`}
        confirmLabel="Yenile"
        onConfirm={(reason) => run({ action: 'regenerate_invite', reason }, 'Davet kodu yenilendi')}
      />

      <ReasonDialog
        open={pending?.kind === 'remove_member'}
        onOpenChange={(o) => !o && close()}
        title={pending?.kind === 'remove_member' ? `${pending.name} klandan çıkarılsın mı?` : ''}
        description="Üyenin kişisel puanı korunur. Aktif savaş kadrosundaysa ödeme payından çıkar; kazandığı skor klan toplamında kalır. Kişiye bildirim gider."
        tone="danger"
        confirmLabel="Klandan çıkar"
        onConfirm={(reason) =>
          pending?.kind === 'remove_member' ? run({ action: 'remove_member', userId: pending.userId, reason }, 'Üye klandan çıkarıldı') : Promise.resolve()
        }
      />

      <ReasonDialog
        open={pending?.kind === 'transfer_owner'}
        onOpenChange={(o) => !o && close()}
        title={pending?.kind === 'transfer_owner' ? `Liderlik ${pending.name} kişisine devredilsin mi?` : ''}
        description={`Mevcut lider (${displayName(d.owner)}) üye olarak kalır. İki tarafa da bildirim gider.`}
        confirmLabel="Liderliği devret"
        onConfirm={(reason) =>
          pending?.kind === 'transfer_owner' ? run({ action: 'transfer_owner', userId: pending.userId, reason }, 'Liderlik devredildi') : Promise.resolve()
        }
      />
    </div>
  );
}
