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
import { STORE_DICT, useStoreCopy } from './copy';
import { useSourceT } from '@/components/ds/page/source-dict';

export function RewardDetailBody({ id, onEdit, onOpenOther }: { id: string; onEdit: (r: RewardListItem) => void; onOpenOther: (id: string) => void }) {
  const q = useQuery({ queryKey: storeKeys.reward(id), queryFn: () => fetchReward(id), staleTime: 15_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(d) => <DetailContent d={d} onEdit={onEdit} onOpenOther={onOpenOther} />}
    </QueryState>
  );
}

function DetailContent({ d, onEdit, onOpenOther }: { d: RewardDetail; onEdit: (r: RewardListItem) => void; onOpenOther: (id: string) => void }) {
  const fx = useStoreCopy().fx;
  const L = useSourceT(STORE_DICT);
  const ux = useStoreCopy().ui;
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
    description: h.changes.length ? h.changes.map((c) => `${L(fieldLabel(c.field))}: ${L(showValue(c.from))} → ${L(showValue(c.to))}`).join(' · ') : undefined,
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
            <StatusBadge size="sm" {...statusBadgeProps(REWARD_STATUS, r.status)} label={L(statusBadgeProps(REWARD_STATUS, r.status).label)} />
            <StatusBadge size="sm" icon={null} tone="neutral" label={L(REWARD_TYPE_LABEL[r.type])} />
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
              {ux.duzenle}
            </Button>
            {r.isActive ? (
              <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'unpublish' }, ux.odulTaslagaAlindi).catch((e) => toast.error(errorText(e)))}>
                <EyeOff className="h-4 w-4" aria-hidden />
                {ux.taslagaAl}
              </Button>
            ) : (
              <ConfirmAction
                tone="brand"
                title={fx.publishTitle(r.name)}
                description={fx.publishDesc(fmtNumber(r.cost))}
                confirmLabel={ux.yayinla}
                trigger={
                  <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                    <Rocket className="h-4 w-4" aria-hidden />
                    {ux.yayinla}
                  </Button>
                }
                onConfirm={() => run({ action: 'publish' }, ux.odulYayinda)}
              />
            )}
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'duplicate' }, ux.taslakKopyaOlusturuldu).catch((e) => toast.error(errorText(e)))}>
              <Copy className="h-4 w-4" aria-hidden />
              {ux.cogalt}
            </Button>
            <ConfirmAction
              tone="warning"
              title={fx.archiveTitle(r.name)}
              description={ux.yeniTalepDururVe}
              impact={[
                { label: ux.toplamTalep, value: fmtNumber(r.claimsTotal) },
                { label: ux.bekleyenKullanilmamis, value: fmtNumber(r.pending), emphasis: r.pending > 0 },
              ]}
              irreversibleNote={false}
              confirmPhrase={r.claimsTotal > 0 ? r.name : undefined}
              confirmLabel={ux.arsivle}
              trigger={
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <Archive className="h-4 w-4" aria-hidden />
                  {ux.arsivle}
                </Button>
              }
              onConfirm={() => run({ action: 'archive' }, ux.odulArsivlendi)}
            />
          </>
        ) : (
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'restore' }, ux.odulTaslakOlarakGeri).catch((e) => toast.error(errorText(e)))}>
            <ArchiveRestore className="h-4 w-4" aria-hidden />
            {ux.arsivdenGeriAl}
          </Button>
        )}
      </div>

      <MetricGrid cols={3}>
        <MetricTile size="compact" label={ux.t30GunTalep} metric={{ value: total30, series: d.series.map((x) => x.count) }} sparklineLabel={fx.requests30(total30)} />
        <MetricTile size="compact" label={ux.toplamTalep} metric={{ value: r.claimsTotal }} />
        <MetricTile size="compact" label={ux.bekleyen} metric={{ value: r.pending }} tone={r.pending > 0 ? 'warning' : 'neutral'} href={`?tab=talepler&rewardId=${r.id}&status=pending`} />
      </MetricGrid>

      <KeyValueList
        items={[
          { label: ux.maliyet, value: `${fmtNumber(r.cost)} puan` },
          { label: ux.stok, value: L(stockLabel(r.stock).label) },
          { label: ux.olusturuldu, value: fmtDate(r.createdAt) },
          { label: ux.sonDegisiklik, value: fmtDateTime(r.updatedAt) },
        ]}
      />

      {!archived ? <StockSection r={r} onDone={refresh} /> : null}
      {!archived && (r.type === 'coupon' || r.pool.enabled) ? <PoolSection d={d} onDone={refresh} /> : null}

      <SectionCard title={ux.sonTalepler} description={ux.teslimKullanimVeIptal}>
        {d.recent.length === 0 ? (
          <EmptyState compact title={ux.henuzTalepYok} description={null} />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {d.recent.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-fg">{x.user.name || x.user.email || ux.kullanici}</span>
                  <span className="block font-mono text-xs text-fg-muted">{x.code ?? '—'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <time className="text-xs text-fg-muted" dateTime={x.redeemedAt}>
                    {fmtDateTime(x.redeemedAt)}
                  </time>
                  <StatusBadge size="sm" {...statusBadgeProps(REDEMPTION_STATUS, x.status)} label={L(statusBadgeProps(REDEMPTION_STATUS, x.status).label)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={ux.degisiklikGecmisi}>
        <Timeline events={events} dense groupByDay ariaLabel={ux.odulDegisiklikGecmisi} emptyLabel={ux.kayitliDegisiklikYok} />
      </SectionCard>
    </div>
  );
}

function StockSection({ r, onDone }: { r: RewardListItem; onDone: () => unknown }) {
  const fx = useStoreCopy().fx;
  const L = useSourceT(STORE_DICT);
  const uy = useStoreCopy().ui2;
  const ux = useStoreCopy().ui;
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
    <SectionCard title={ux.stok} description={ux.goreliDegisirSizDuzenlerken}>
      {r.stock < 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-fg">
            <InfinityIcon className="h-4 w-4" aria-hidden /> {ux.sinirsizStok}
          </p>
          <Button variant="outline" className="min-h-11 sm:min-h-9" size="sm" disabled={busy} onClick={() => act({ action: 'unlimited', unlimited: false }, ux.sinirliStogaGecildi0)}>
            {ux.sinirliStogaGec}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void act({ action: 'stock', delta: n }, n > 0 ? fx.stockAdded(fmtNumber(n)) : fx.stockRemoved(fmtNumber(-n)));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`stock-${r.id}`}>{sx.stockDelta}</Label>
            <Input id={`stock-${r.id}`} inputMode="numeric" className="min-h-11 w-32" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} placeholder="+50" />
          </div>
          <Button type="submit" className="min-h-11 sm:min-h-10" disabled={!valid || busy}>
            {uy.uygula}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 sm:min-h-10" disabled={busy} onClick={() => act({ action: 'unlimited', unlimited: true }, ux.stokSinirsiz)}>
            {ux.sinirsizYap}
          </Button>
          <p className="w-full text-sm text-fg-muted">
            {fx.currentLabel} <strong className="text-fg">{L(stockLabel(r.stock).label)}</strong>
          </p>
        </form>
      )}
    </SectionCard>
  );
}

function PoolSection({ d, onDone }: { d: RewardDetail; onDone: () => unknown }) {
  const fx = useStoreCopy().fx;
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  const r = d.item;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const codes = splitCodes(text);
  const add = async () => {
    setBusy(true);
    try {
      const res = await poolAction(r.id, { action: 'add', codes });
      const skipped = res.skipped.length ? fx.codesSkipped(fmtNumber(res.skipped.length)) : '';
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
      title={ux.partnerKodHavuzu}
      description={
        r.pool.enabled
          ? fx.poolOnDesc(fmtNumber(r.pool.remaining))
          : ux.partnerinVerdigiKodlariYukleyin
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`pool-${r.id}`}>{sx.codesInput}</Label>
          <Textarea id={`pool-${r.id}`} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'PARTNER-AB12\nPARTNER-CD34'} className="font-mono" />
          <p className="text-xs text-fg-muted">
            {fx.codesDetected(fmtNumber(codes.length), fmtNumber(POOL_MAX))}
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
              title={ux.kodHavuzuKapatilsinMi}
              description={ux.dagitilmamisKodlarSilinirVe}
              impact={[{ label: ux.silinecekDagitilmamisKod, value: fmtNumber(r.pool.remaining), emphasis: true }]}
              confirmLabel={ux.havuzuKapat}
              trigger={
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  Havuzu kapat
                </Button>
              }
              onConfirm={async () => {
                await poolAction(r.id, { action: 'disable' });
                toast.success(ux.kodHavuzuKapatildi);
                await onDone();
              }}
            />
          ) : null}
        </div>
        {d.poolCodes.length ? (
          <details className="rounded-md border border-border p-2">
            <summary className="min-h-11 cursor-pointer content-center px-1 text-sm text-fg">
              {fx.nextCodes(fmtNumber(r.pool.remaining))}
              {r.pool.remaining > d.poolCodes.length ? fx.firstShown(fmtNumber(d.poolCodes.length)) : ''})
            </summary>
            <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
              {d.poolCodes.map((c) => (
                <li key={c} className="flex items-center justify-between gap-2 font-mono text-xs">
                  <span className="truncate">{c}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 sm:size-8"
                    aria-label={fx.removeCode(c)}
                    onClick={() =>
                      poolAction(r.id, { action: 'remove', code: c })
                        .then(() => {
                          toast.success(ux.kodCikarildi);
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
