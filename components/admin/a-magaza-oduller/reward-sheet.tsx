'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Copy, EyeOff, Infinity as InfinityIcon, KeyRound, Pencil, Rocket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { KeyValueList, MetricGrid, MetricTile, StatusBadge, Timeline, statusBadgeProps, type TimelineEvent } from '@/components/ds/data';
import { ConfirmAction, EmptyState, QueryState, SectionCard } from '@/components/states';
import { POOL_MAX, REWARD_TYPE_LABEL, splitCodes, type RewardDetail, type RewardListItem } from '@/lib/admin-store/contract';
import { errorText, fetchReward, poolAction, rewardAction, storeKeys } from './api';
import { REDEMPTION_STATUS, REWARD_STATUS, fieldLabel, fmtDate, fmtDateTime, fmtNumber, rulesSummary, showValue, stockLabel } from './format';
import { RewardIcon } from './parts';
import { useStoreCopy } from './copy';

export function RewardDetailBody({ id, onEdit, onOpenOther }: { id: string; onEdit: (r: RewardListItem) => void; onOpenOther: (id: string) => void }) {
  const q = useQuery({ queryKey: storeKeys.reward(id), queryFn: () => fetchReward(id), staleTime: 15_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(d) => <DetailContent d={d} onEdit={onEdit} onOpenOther={onOpenOther} />}
    </QueryState>
  );
}

function DetailContent({ d, onEdit, onOpenOther }: { d: RewardDetail; onEdit: (r: RewardListItem) => void; onOpenOther: (id: string) => void }) {
  const qc = useQueryClient();
  const r = d.item;
  const archived = r.status === 'archived';
  const refresh = () => qc.invalidateQueries({ queryKey: storeKeys.all });
  const run = async (body: Parameters<typeof rewardAction>[1], success: string) => {
    const res = await rewardAction(r.id, body);
    toast.success(success);
    await refresh();
    if (res.createdId) onOpenOther(res.createdId);
  };
  const total30 = d.series.reduce((s, x) => s + x.count, 0);
  const rules = rulesSummary(r.rules);

  const events: TimelineEvent[] = d.history.map((h) => ({
    id: h.id,
    title: h.label,
    description: h.changes.length ? h.changes.map((c) => `${fieldLabel(c.field)}: ${showValue(c.from)} → ${showValue(c.to)}`).join(' · ') : undefined,
    at: h.at,
    actor: h.actor ?? 'Sistem',
  }));

  return (
    <div className="space-y-6">
      <section className="flex items-start gap-4">
        <RewardIcon icon={r.icon} name={r.name} size="lg" muted={archived} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="qx-h3 truncate text-fg">{r.name}</h3>
          <p className="text-sm text-fg-muted">{r.description}</p>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge size="sm" {...statusBadgeProps(REWARD_STATUS, r.status)} />
            <StatusBadge size="sm" icon={null} tone="neutral" label={REWARD_TYPE_LABEL[r.type]} />
            {rules.map((x) => (
              <StatusBadge key={x} size="sm" icon={null} tone="info" label={x} />
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {!archived ? (
          <>
            <Button className="min-h-11 sm:min-h-9" size="sm" onClick={() => onEdit(r)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Düzenle
            </Button>
            {r.isActive ? (
              <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'unpublish' }, 'Ödül taslağa alındı').catch((e) => toast.error(errorText(e)))}>
                <EyeOff className="h-4 w-4" aria-hidden />
                Taslağa al
              </Button>
            ) : (
              <ConfirmAction
                tone="brand"
                title={`“${r.name}” yayınlansın mı?`}
                description={`Müşteri mağazasında görünür ve ${fmtNumber(r.cost)} puana alınabilir.`}
                confirmLabel="Yayınla"
                trigger={
                  <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                    <Rocket className="h-4 w-4" aria-hidden />
                    Yayınla
                  </Button>
                }
                onConfirm={() => run({ action: 'publish' }, 'Ödül yayında')}
              />
            )}
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'duplicate' }, 'Taslak kopya oluşturuldu').catch((e) => toast.error(errorText(e)))}>
              <Copy className="h-4 w-4" aria-hidden />
              Çoğalt
            </Button>
            <ConfirmAction
              tone="warning"
              title={`“${r.name}” arşivlensin mi?`}
              description="Yeni talep durur ve katalogdan kalkar. Müşterilerin aldığı ödüller ve kodlar korunur; puan iadesi gerekmez. Arşivden geri alabilirsiniz."
              impact={[
                { label: 'Toplam talep', value: fmtNumber(r.claimsTotal) },
                { label: 'Bekleyen (kullanılmamış)', value: fmtNumber(r.pending), emphasis: r.pending > 0 },
              ]}
              irreversibleNote={false}
              confirmPhrase={r.claimsTotal > 0 ? r.name : undefined}
              confirmLabel="Arşivle"
              trigger={
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <Archive className="h-4 w-4" aria-hidden />
                  Arşivle
                </Button>
              }
              onConfirm={() => run({ action: 'archive' }, 'Ödül arşivlendi')}
            />
          </>
        ) : (
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'restore' }, 'Ödül taslak olarak geri alındı').catch((e) => toast.error(errorText(e)))}>
            <ArchiveRestore className="h-4 w-4" aria-hidden />
            Arşivden geri al
          </Button>
        )}
      </div>

      <MetricGrid cols={3}>
        <MetricTile size="compact" label="30 gün talep" metric={{ value: total30, series: d.series.map((x) => x.count) }} sparklineLabel={`Son 30 günde ${total30} talep`} />
        <MetricTile size="compact" label="Toplam talep" metric={{ value: r.claimsTotal }} />
        <MetricTile size="compact" label="Bekleyen" metric={{ value: r.pending }} tone={r.pending > 0 ? 'warning' : 'neutral'} href={`?tab=talepler&rewardId=${r.id}&status=pending`} />
      </MetricGrid>

      <KeyValueList
        items={[
          { label: 'Maliyet', value: `${fmtNumber(r.cost)} puan` },
          { label: 'Stok', value: stockLabel(r.stock).label },
          { label: 'Oluşturuldu', value: fmtDate(r.createdAt) },
          { label: 'Son değişiklik', value: fmtDateTime(r.updatedAt) },
        ]}
      />

      {!archived ? <StockSection r={r} onDone={refresh} /> : null}
      {!archived && (r.type === 'coupon' || r.pool.enabled) ? <PoolSection d={d} onDone={refresh} /> : null}

      <SectionCard title="Son talepler" description="Teslim, kullanım ve iptal “Talepler” sekmesinde.">
        {d.recent.length === 0 ? (
          <EmptyState compact title="Henüz talep yok" description={null} />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {d.recent.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-fg">{x.user.name || x.user.email || 'Kullanıcı'}</span>
                  <span className="block font-mono text-xs text-fg-muted">{x.code ?? '—'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <time className="text-xs text-fg-muted" dateTime={x.redeemedAt}>
                    {fmtDateTime(x.redeemedAt)}
                  </time>
                  <StatusBadge size="sm" {...statusBadgeProps(REDEMPTION_STATUS, x.status)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Değişiklik geçmişi">
        <Timeline events={events} dense groupByDay ariaLabel="Ödül değişiklik geçmişi" emptyLabel="Kayıtlı değişiklik yok" />
      </SectionCard>
    </div>
  );
}

function StockSection({ r, onDone }: { r: RewardListItem; onDone: () => unknown }) {
  const sx = useStoreCopy();
  const [delta, setDelta] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number.parseInt(delta, 10);
  const valid = Number.isInteger(n) && n !== 0;
  const act = async (body: Parameters<typeof rewardAction>[1], msg: string) => {
    setBusy(true);
    try {
      await rewardAction(r.id, body);
      toast.success(msg);
      setDelta('');
      await onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (r.pool.enabled) return null;
  return (
    <SectionCard title="Stok" description="Göreli değişir: siz düzenlerken gelen talepler ezilmez.">
      {r.stock < 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-fg">
            <InfinityIcon className="h-4 w-4" aria-hidden /> Sınırsız stok
          </p>
          <Button variant="outline" className="min-h-11 sm:min-h-9" size="sm" disabled={busy} onClick={() => act({ action: 'unlimited', unlimited: false }, 'Sınırlı stoğa geçildi (0)')}>
            Sınırlı stoğa geç
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void act({ action: 'stock', delta: n }, n > 0 ? `${fmtNumber(n)} adet eklendi` : `${fmtNumber(-n)} adet düşüldü`);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`stock-${r.id}`}>{sx.stockDelta}</Label>
            <Input id={`stock-${r.id}`} inputMode="numeric" className="min-h-11 w-32" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} placeholder="+50" />
          </div>
          <Button type="submit" className="min-h-11 sm:min-h-10" disabled={!valid || busy}>
            Uygula
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 sm:min-h-10" disabled={busy} onClick={() => act({ action: 'unlimited', unlimited: true }, 'Stok sınırsız')}>
            Sınırsız yap
          </Button>
          <p className="w-full text-sm text-fg-muted">
            Şu an: <strong className="text-fg">{stockLabel(r.stock).label}</strong>
          </p>
        </form>
      )}
    </SectionCard>
  );
}

function PoolSection({ d, onDone }: { d: RewardDetail; onDone: () => unknown }) {
  const sx = useStoreCopy();
  const r = d.item;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const codes = splitCodes(text);
  const add = async () => {
    setBusy(true);
    try {
      const res = await poolAction(r.id, { action: 'add', codes });
      const skipped = res.skipped.length ? ` · ${fmtNumber(res.skipped.length)} kod atlandı (geçersiz, tekrar ya da daha önce dağıtılmış)` : '';
      toast.success(`${fmtNumber(res.added)} kod eklendi · havuzda ${fmtNumber(res.remaining)}${skipped}`);
      setText('');
      await onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      title="Partner kod havuzu"
      description={
        r.pool.enabled
          ? `Her talep havuzdan sıradaki kodu alır. Havuzda ${fmtNumber(r.pool.remaining)} kod var; stok = kod sayısı.`
          : 'Partnerin verdiği kodları yükleyin: her talep sıradaki kodu alır, kodlar bitince ödül tükenir.'
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`pool-${r.id}`}>{sx.codesInput}</Label>
          <Textarea id={`pool-${r.id}`} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'PARTNER-AB12\nPARTNER-CD34'} className="font-mono" />
          <p className="text-xs text-fg-muted">
            {fmtNumber(codes.length)} kod algılandı · harf, rakam, tire ve alt çizgi; 3–64 karakter · havuz en fazla {fmtNumber(POOL_MAX)} kod.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 sm:min-h-9" size="sm" disabled={busy || codes.length === 0} onClick={() => void add()}>
            <KeyRound className="h-4 w-4" aria-hidden />
            Havuza ekle
          </Button>
          {r.pool.enabled ? (
            <ConfirmAction
              tone="danger"
              title="Kod havuzu kapatılsın mı?"
              description="Dağıtılmamış kodlar silinir ve stok 0 olur. Dağıtılmış kodlar müşterilerde kalır."
              impact={[{ label: 'Silinecek dağıtılmamış kod', value: fmtNumber(r.pool.remaining), emphasis: true }]}
              confirmLabel="Havuzu kapat"
              trigger={
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  Havuzu kapat
                </Button>
              }
              onConfirm={async () => {
                await poolAction(r.id, { action: 'disable' });
                toast.success('Kod havuzu kapatıldı');
                await onDone();
              }}
            />
          ) : null}
        </div>
        {d.poolCodes.length ? (
          <details className="rounded-md border border-border p-2">
            <summary className="min-h-11 cursor-pointer content-center px-1 text-sm text-fg">
              Sıradaki kodlar ({fmtNumber(r.pool.remaining)}
              {r.pool.remaining > d.poolCodes.length ? `, ilk ${fmtNumber(d.poolCodes.length)} gösteriliyor` : ''})
            </summary>
            <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
              {d.poolCodes.map((c) => (
                <li key={c} className="flex items-center justify-between gap-2 font-mono text-xs">
                  <span className="truncate">{c}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 sm:size-8"
                    aria-label={`${c} kodunu havuzdan çıkar`}
                    onClick={() =>
                      poolAction(r.id, { action: 'remove', code: c })
                        .then(() => {
                          toast.success('Kod çıkarıldı');
                          return onDone();
                        })
                        .catch((e) => toast.error(errorText(e)))
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </SectionCard>
  );
}
