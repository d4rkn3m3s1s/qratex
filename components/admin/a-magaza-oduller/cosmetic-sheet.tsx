'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Archive, ArchiveRestore, Copy, EyeOff, Pencil, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, MetricGrid, MetricTile, StatusBadge, Timeline, statusBadgeProps, type TimelineEvent } from '@/components/ds/data';
import { RarityBadge } from '@/components/ds/play';
import { ConfirmAction, EmptyState, QueryState, SectionCard } from '@/components/states';
import { CosmeticPreview } from '@/components/customer/m-cuzdan-oduller/cosmetic-preview';
import { COSMETIC_TYPE_LABEL, type CosmeticDetail, type CosmeticListItem } from '@/lib/admin-store/contract';
import { cosmeticAction, errorText, fetchCosmetic, storeKeys } from './api';
import { ADMIN_PREVIEW_USER } from './cosmetics-tab';
import { COSMETIC_STATUS, fieldLabel, fmtDate, fmtDateTime, fmtNumber, showValue } from './format';

export function CosmeticDetailBody({ id, onEdit, onOpenOther }: { id: string; onEdit: (c: CosmeticListItem) => void; onOpenOther: (id: string) => void }) {
  const q = useQuery({ queryKey: storeKeys.cosmetic(id), queryFn: () => fetchCosmetic(id), staleTime: 15_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(d) => <Content d={d} onEdit={onEdit} onOpenOther={onOpenOther} />}
    </QueryState>
  );
}

function Content({ d, onEdit, onOpenOther }: { d: CosmeticDetail; onEdit: (c: CosmeticListItem) => void; onOpenOther: (id: string) => void }) {
  const qc = useQueryClient();
  const c = d.item;
  const archived = c.status === 'archived';
  const run = async (body: Parameters<typeof cosmeticAction>[1], msg: string) => {
    const r = await cosmeticAction(c.id, body);
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: storeKeys.all });
    if (r.createdId) onOpenOther(r.createdId);
  };
  const total30 = d.series.reduce((s, x) => s + x.count, 0);
  const events: TimelineEvent[] = d.history.map((h) => ({
    id: h.id,
    title: h.label,
    description: h.changes.length ? h.changes.map((x) => `${fieldLabel(x.field)}: ${showValue(x.from)} → ${showValue(x.to)}`).join(' · ') : undefined,
    at: h.at,
    actor: h.actor ?? 'Sistem',
  }));

  return (
    <div className="space-y-6">
      <section className="group flex items-start gap-4" tabIndex={0} aria-label="Önizleme (odakta oynar)">
        {c.type !== 'other' ? <CosmeticPreview item={{ type: c.type, asset: c.asset, name: c.name }} preview={ADMIN_PREVIEW_USER} /> : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="qx-h3 truncate text-fg">{c.name}</h3>
          {c.description ? <p className="text-sm text-fg-muted">{c.description}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge size="sm" {...statusBadgeProps(COSMETIC_STATUS, c.status)} />
            <RarityBadge rarity={c.rarity} />
            <StatusBadge size="sm" icon={null} tone="neutral" label={c.type === 'other' ? 'Bilinmeyen tür' : COSMETIC_TYPE_LABEL[c.type]} />
          </div>
        </div>
      </section>

      {c.assetWarning ? (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          {c.assetWarning} Düzenleyip geçerli bir görünüm seçin.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!archived ? (
          <>
            <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => onEdit(c)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Düzenle
            </Button>
            {c.isActive ? (
              <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'deactivate' }, 'Satıştan kaldırıldı').catch((e) => toast.error(errorText(e)))}>
                <EyeOff className="h-4 w-4" aria-hidden />
                Satıştan kaldır
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'activate' }, 'Satışa açıldı').catch((e) => toast.error(errorText(e)))}>
                <ShoppingBag className="h-4 w-4" aria-hidden />
                Satışa aç
              </Button>
            )}
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'duplicate' }, 'Kopya oluşturuldu (satışta değil)').catch((e) => toast.error(errorText(e)))}>
              <Copy className="h-4 w-4" aria-hidden />
              Çoğalt
            </Button>
            <ConfirmAction
              tone="warning"
              title={`“${c.name}” arşivlensin mi?`}
              description="Mağazadan kalkar, satın alınamaz ve hediye edilemez. Sahipler ürünü kullanmaya devam eder. Arşivden geri alabilirsiniz."
              impact={[{ label: 'Sahip (korunur)', value: fmtNumber(c.owners) }]}
              irreversibleNote={false}
              confirmLabel="Arşivle"
              trigger={
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <Archive className="h-4 w-4" aria-hidden />
                  Arşivle
                </Button>
              }
              onConfirm={() => run({ action: 'archive' }, 'Ürün arşivlendi')}
            />
          </>
        ) : (
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => run({ action: 'restore' }, 'Arşivden geri alındı (satışta değil)').catch((e) => toast.error(errorText(e)))}>
            <ArchiveRestore className="h-4 w-4" aria-hidden />
            Arşivden geri al
          </Button>
        )}
      </div>

      <MetricGrid cols={3}>
        <MetricTile size="compact" label="30 gün edinim" metric={{ value: total30, series: d.series.map((x) => x.count) }} sparklineLabel={`Son 30 günde ${total30} edinim`} />
        <MetricTile size="compact" label="Sahip" metric={{ value: c.owners }} />
        <MetricTile size="compact" label="Kuşanmış" metric={{ value: c.equipped }} />
      </MetricGrid>

      <KeyValueList
        items={[
          { label: 'Fiyat', value: c.price > 0 ? `${fmtNumber(c.price)} puan` : 'Ücretsiz' },
          { label: 'Kısa ad', value: c.slug, mono: true, copyValue: c.slug ?? undefined },
          { label: 'Görünüm', value: c.asset, mono: true },
          { label: 'Oluşturuldu', value: fmtDate(c.createdAt) },
        ]}
      />

      <SectionCard title="Son sahipler">
        {d.recentOwners.length === 0 ? (
          <EmptyState compact title="Henüz sahibi yok" description={null} />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {d.recentOwners.map((o) => (
              <li key={`${o.userId}-${o.acquiredAt}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-fg">{o.name || o.email || 'Kullanıcı'}</span>
                  <span className="block text-xs text-fg-muted">
                    {o.gifted ? 'Hediye' : 'Satın alma'}
                    {o.equipped ? ' · kuşanmış' : ''}
                  </span>
                </span>
                <time className="text-xs text-fg-muted" dateTime={o.acquiredAt}>
                  {fmtDateTime(o.acquiredAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Değişiklik geçmişi">
        <Timeline events={events} dense groupByDay ariaLabel="Ürün değişiklik geçmişi" emptyLabel="Kayıtlı değişiklik yok" />
      </SectionCard>
    </div>
  );
}
