'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Clock, Flag, Scale, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmAction, QueryState, SectionCard } from '@/components/states';
import { KeyValueList, StatusBadge, statusBadgeProps, Timeline, type TimelineEvent } from '@/components/ds/data';
import { AUDIT_ACTION_LABEL, LEDGER_SOURCE_LABEL, type BattleDetail } from '@/lib/admin-squads/contract';
import { battleAction, fetchBattle, squadsKeys } from './api';
import { BATTLE_VIEW, fmtDateTime, fmtNumber, fmtRemaining } from './format';
import { FormField, ImpactList, ReasonDialog, ScoreBar } from './parts';

const EXTEND_PRESETS = [1, 6, 12, 24, 48] as const;

export function BattleDetailBody({ id }: { id: string }) {
  const q = useQuery({
    queryKey: squadsKeys.battle(id),
    queryFn: () => fetchBattle(id),
    staleTime: 10_000,
    // Canlı savaşta skor 30 sn'de bir tazelenir (sekme görünürken).
    refetchInterval: (query) => (query.state.data?.view === 'live' ? 30_000 : false),
    refetchIntervalInBackground: false,
  });
  return (
    <QueryState query={q} skeleton="detail" errorKind={q.error && (q.error as { status?: number }).status === 404 ? 'notFound' : undefined}>
      {(d) => <BattleDetailView d={d} />}
    </QueryState>
  );
}

function BattleDetailView({ d }: { d: BattleDetail }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | 'cancel' | 'extend' | 'adjust'>(null);
  const [extendHours, setExtendHours] = useState<number>(24);
  const [s1, setS1] = useState(String(d.squad1Score));
  const [s2, setS2] = useState(String(d.squad2Score));
  const s1Id = useId();
  const s2Id = useId();

  const refresh = () => qc.invalidateQueries({ queryKey: squadsKeys.all });
  const isOpen = d.status === 'pending' || d.status === 'active';
  const isActive = d.status === 'active';
  const escrow = d.rewardFunded && !d.rewardRefunded ? d.rewardPool : 0;
  const winner = d.winnerId === d.squad1.id ? 'a' : d.winnerId === d.squad2.id ? 'b' : d.status === 'completed' ? 'draw' : null;
  const leaderSquadId = d.squad1Score > d.squad2Score ? d.squad1.id : d.squad2Score > d.squad1Score ? d.squad2.id : null;
  const leaderCount = leaderSquadId ? d.participants.filter((p) => p.squadId === leaderSquadId).length : 0;
  const extendBase = Math.max(new Date(d.endTime).getTime(), Date.now());
  const newEnd = new Date(extendBase + extendHours * 3600_000);
  const n1 = Number(s1);
  const n2 = Number(s2);
  const scoresValid = Number.isInteger(n1) && Number.isInteger(n2) && n1 >= 0 && n2 >= 0 && (n1 !== d.squad1Score || n2 !== d.squad2Score);

  const events: TimelineEvent[] = d.audit.map((a) => ({
    id: a.id,
    title: AUDIT_ACTION_LABEL[a.action] ?? a.action,
    description: a.reason ?? undefined,
    at: a.createdAt,
    actor: a.actorName ?? undefined,
    tone: a.action === 'SQUAD_BATTLE_CANCEL' ? 'danger' : a.action === 'SQUAD_BATTLE_SETTLE' ? 'success' : 'neutral',
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...statusBadgeProps(BATTLE_VIEW, d.view)} />
        <StatusBadge size="sm" tone={d.origin === 'admin' ? 'brand' : 'neutral'} icon={null} label={d.origin === 'admin' ? 'Yönetici onur savaşı' : 'Lider meydan okuması'} />
        <StatusBadge size="sm" tone={d.rewardFunded ? 'info' : 'neutral'} icon={null} label={d.rewardFunded ? `Fonlu havuz · ${fmtNumber(d.rewardPool)} puan` : 'Ödülsüz'} />
      </div>

      <div aria-live="polite">
        <ScoreBar a={d.squad1Score} b={d.squad2Score} labelA={d.squad1.name} labelB={d.squad2.name} winner={winner} />
        {d.status === 'completed' ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-fg">
            <Trophy className="h-4 w-4 text-warning" aria-hidden />
            {winner === 'a' ? `${d.squad1.name} kazandı` : winner === 'b' ? `${d.squad2.name} kazandı` : 'Berabere bitti'}
          </p>
        ) : null}
      </div>

      {isOpen ? (
        <div className="flex flex-wrap gap-2">
          {isActive ? (
            <ConfirmAction
              tone="brand"
              trigger={
                <Button size="sm" className="min-h-11 sm:min-h-9">
                  <Flag className="h-4 w-4" aria-hidden />
                  Şimdi sonuçlandır
                </Button>
              }
              title="Savaş şimdi sonuçlandırılsın mı?"
              description="Mevcut skorla kazanan belirlenir ve savaş kapanır. Bu işlem geri alınamaz."
              impact={[
                {
                  label: 'Sonuç',
                  value: leaderSquadId ? `${leaderSquadId === d.squad1.id ? d.squad1.name : d.squad2.name} kazanır` : 'Berabere',
                },
                {
                  label: 'Ödeme',
                  value:
                    escrow > 0
                      ? leaderSquadId && leaderCount > 0
                        ? `${fmtNumber(escrow)} puan, ${leaderCount} katılımcıya kişi başı ~${fmtNumber(Math.floor(escrow / leaderCount))}`
                        : `${fmtNumber(escrow)} puan meydan okuyana iade edilir`
                      : 'Ödülsüz savaş: puan dağıtılmaz',
                  emphasis: escrow > 0,
                },
              ]}
              confirmLabel="Sonuçlandır"
              onConfirm={async () => {
                const r = await battleAction(d.id, { action: 'finish' });
                if (r.action === 'finish') {
                  toast.success(
                    r.paidOut > 0
                      ? `Savaş sonuçlandı · ${fmtNumber(r.paidOut)} puan dağıtıldı${r.refunded ? `, ${fmtNumber(r.refunded)} iade` : ''}`
                      : r.refunded > 0
                        ? `Savaş sonuçlandı · ${fmtNumber(r.refunded)} puan iade edildi`
                        : 'Savaş sonuçlandı · ödül dağıtımı yok (ödülsüz savaş)'
                  );
                }
                await refresh();
              }}
            />
          ) : null}
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setDialog('extend')}>
            <Clock className="h-4 w-4" aria-hidden />
            Süreyi uzat
          </Button>
          {isActive ? (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => {
                setS1(String(d.squad1Score));
                setS2(String(d.squad2Score));
                setDialog('adjust');
              }}
            >
              <Scale className="h-4 w-4" aria-hidden />
              Skoru düzelt
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className="min-h-11 text-danger sm:min-h-9" onClick={() => setDialog('cancel')}>
            <Ban className="h-4 w-4" aria-hidden />
            İptal et
          </Button>
        </div>
      ) : null}

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: 'Oluşturuldu', value: fmtDateTime(d.createdAt) },
          { label: 'Başladı', value: d.acceptedAt ? fmtDateTime(d.acceptedAt) : d.status === 'pending' ? 'Rakip liderin kabulü bekleniyor' : '—' },
          {
            label: d.status === 'pending' ? 'Davet geçerliliği' : 'Bitiş',
            value: fmtDateTime(d.endTime),
            hint: isOpen ? fmtRemaining(d.endTime) : undefined,
          },
          { label: 'Ödeme', value: d.paidOutAt ? fmtDateTime(d.paidOutAt) : '—', hint: d.rewardRefunded ? 'Havuz iade edildi' : undefined },
          { label: 'İptal gerekçesi', value: d.cancelReason ?? '—', hidden: d.status !== 'cancelled', span: 2 },
          { label: 'Kimlik', value: d.id, mono: true, copyValue: d.id, span: 2 },
        ]}
      />

      <SectionCard title="Kadro ve katkı" density="compact" headingLevel="h3">
        {d.participants.length === 0 ? (
          <p className="text-sm text-fg-muted">{d.status === 'pending' ? 'Kadro, savaş başladığında donar.' : 'Bu savaşta kayıtlı katılımcı yok.'}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {[d.squad1, d.squad2].map((sq) => (
              <div key={sq.id}>
                <h4 className="mb-1 text-sm font-semibold text-fg">
                  <Link href={`/admin/squads?squad=${encodeURIComponent(sq.id)}`} className="underline-offset-4 hover:underline focus-visible:underline">
                    {sq.name}
                  </Link>
                </h4>
                <ul className="divide-y divide-subtle text-sm">
                  {d.participants
                    .filter((p) => p.squadId === sq.id)
                    .map((p) => (
                      <li key={p.userId} className="flex justify-between gap-2 py-1.5">
                        <Link href={`/admin/users/${p.userId}`} className="min-w-0 truncate underline-offset-4 hover:underline focus-visible:underline">
                          {p.name || 'Adsız üye'}
                        </Link>
                        <span className="tabular-nums text-fg-muted">{fmtNumber(p.score)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Puan hareketleri" description="Bu savaşa bağlı defter kayıtları (tahsilat, ödeme, iade)." density="compact" headingLevel="h3">
        {d.ledger.length === 0 ? (
          <p className="text-sm text-fg-muted">{d.rewardFunded ? 'Henüz hareket yok.' : 'Ödülsüz savaş: puan hareketi oluşmaz.'}</p>
        ) : (
          <ul className="divide-y divide-subtle text-sm">
            {d.ledger.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="min-w-0">
                  {LEDGER_SOURCE_LABEL[l.source] ?? l.source}
                  {l.userId ? (
                    <>
                      {' · '}
                      <Link href={`/admin/users/${l.userId}`} className="underline-offset-4 hover:underline focus-visible:underline">
                        {l.userName ?? 'kullanıcı'}
                      </Link>
                    </>
                  ) : null}
                  {l.status !== 'posted' ? <span className="ml-1 text-xs text-warning">({l.status})</span> : null}
                </span>
                <span className={`tabular-nums ${l.delta < 0 ? 'text-danger' : 'text-success'}`}>
                  {l.delta > 0 ? '+' : ''}
                  {fmtNumber(l.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Zaman çizelgesi" density="compact" headingLevel="h3">
        <Timeline events={events} dense timeStyle="datetime" emptyLabel="Bu savaş için kayıtlı bir işlem yok." ariaLabel="Savaş zaman çizelgesi" />
      </SectionCard>

      <ReasonDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Savaş iptal edilsin mi?"
        description="Savaş silinmez; iptal olarak kapanır ve iki klan lideri bilgilendirilir."
        label="İptal gerekçesi"
        tone="danger"
        confirmLabel="İptal et"
        onConfirm={async (reason) => {
          const r = await battleAction(d.id, { action: 'cancel', reason });
          toast.success(r.action === 'cancel' && r.refunded > 0 ? `Savaş iptal edildi · ${fmtNumber(r.refunded)} puan meydan okuyana iade edildi` : 'Savaş iptal edildi');
          await refresh();
        }}
      >
        <ImpactList
          items={[
            escrow > 0 ? `Ödül havuzundaki ${fmtNumber(escrow)} puan meydan okuyan lidere iade edilir.` : 'Ödülsüz savaş: iade edilecek puan yok.',
            'Biriken skorlar kayıtta kalır; ödeme yapılmaz.',
          ]}
        />
      </ReasonDialog>

      <ReasonDialog
        open={dialog === 'extend'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Süreyi uzat"
        description={`Mevcut bitiş: ${fmtDateTime(d.endTime)} (Europe/Istanbul).`}
        label="Uzatma gerekçesi"
        confirmLabel="Uzat"
        onConfirm={async (reason) => {
          await battleAction(d.id, { action: 'extend', endTime: newEnd.toISOString(), reason });
          toast.success(`Bitiş ${fmtDateTime(newEnd.toISOString())} olarak güncellendi`);
          await refresh();
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">Ne kadar uzatılsın?</legend>
          <div className="flex flex-wrap gap-2">
            {EXTEND_PRESETS.map((h) => (
              <Button key={h} type="button" size="sm" variant={extendHours === h ? 'default' : 'outline'} className="min-h-11 sm:min-h-9" aria-pressed={extendHours === h} onClick={() => setExtendHours(h)}>
                +{h} saat
              </Button>
            ))}
          </div>
          <p className="text-sm text-fg-muted">Yeni bitiş: {fmtDateTime(newEnd.toISOString())} · en fazla 7 gün sonrası.</p>
        </fieldset>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === 'adjust'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Skoru düzelt"
        description="Yalnız hata ya da suistimal düzeltmesi için. Eski ve yeni skor gerekçeyle denetime yazılır."
        minLength={5}
        tone="danger"
        confirmLabel="Skoru kaydet"
        extraValid={scoresValid}
        onConfirm={async (reason) => {
          await battleAction(d.id, { action: 'adjust_score', squad1Score: n1, squad2Score: n2, reason });
          toast.success('Skor düzeltildi');
          await refresh();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField htmlFor={s1Id} label={`${d.squad1.name} skoru`} hint={`Şu an ${fmtNumber(d.squad1Score)}`}>
            <Input id={s1Id} inputMode="numeric" value={s1} onChange={(e) => setS1(e.target.value.replace(/[^0-9]/g, ''))} className="min-h-11" />
          </FormField>
          <FormField htmlFor={s2Id} label={`${d.squad2.name} skoru`} hint={`Şu an ${fmtNumber(d.squad2Score)}`}>
            <Input id={s2Id} inputMode="numeric" value={s2} onChange={(e) => setS2(e.target.value.replace(/[^0-9]/g, ''))} className="min-h-11" />
          </FormField>
        </div>
      </ReasonDialog>
    </div>
  );
}
