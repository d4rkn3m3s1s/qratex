'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, AlertTriangle, KeySquare, Pause, Pencil, Play, Plus, Webhook as WebhookIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar, SectionCard, useUrlState, type FilterField } from '@/components/ds/page';
import { DataTable, DetailSheet, KeyValueList, StatusBadge, Timeline, useDetailSheet, type DataTableColumnMeta } from '@/components/ds/data';
import { ConfirmAction, QueryState, TONE_CALLOUT } from '@/components/states';
import { webhookEventLabel, type WebhookItem } from '@/lib/integrations/contract';
import { DISABLED_REASON_LABEL } from '@/lib/integrations/meta';
import { cn } from '@/lib/utils';
import { webhookQs } from './qs';
import { errorText, fetchWebhook, fetchWebhooks, intKeys, updateWebhook } from './api';
import { DeliveryLog } from './deliveries';
import { RotateSecretDialog, WebhookFormDialog } from './webhook-dialogs';
import { TestPanel } from './test-panel';
import { WEBHOOK_STATUS_META, fmtAbs, fmtRel, healthSummary } from './format';
import { AdminEntegrasyonlarText } from './copy';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'wq', label: 'Ara', placeholder: 'Adres ya da açıklama' },
  {
    type: 'select',
    key: 'wstatus',
    label: 'Durum',
    allLabel: null,
    defaultValue: 'active',
    options: [
      { value: 'active', label: 'Etkin' },
      { value: 'paused', label: 'Duraklatılan' },
      { value: 'archived', label: 'Arşiv' },
      { value: 'all', label: 'Tümü' },
    ],
  },
];

function EventChips({ w }: { w: WebhookItem }) {
  const shown = w.events.slice(0, 2);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((e) => (
        <StatusBadge key={e} size="sm" tone="info" icon={null} label={webhookEventLabel(e)} />
      ))}
      {w.events.length > 2 ? <StatusBadge size="sm" tone="neutral" icon={null} label={`+${w.events.length - 2}`} /> : null}
      {w.deadEvents.length ? <StatusBadge size="sm" tone="warning" label={`${w.deadEvents.length} desteklenmeyen olay`} title={w.deadEvents.join(', ')} /> : null}
    </div>
  );
}

/** Webhook'lar: abonelikler + 24 sa sağlık + teslim günlüğü (yeniden gönder) + test. */
export function WebhooksTab({ initial }: { initial: { qs: string; items: WebhookItem[] } | null }) {
  const sp = useSearchParams();
  const { get, set } = useUrlState();
  const qs = webhookQs((k) => sp.get(k));
  const sheet = useDetailSheet('webhook');
  const creating = get('create') === 'webhook';

  const list = useQuery({
    queryKey: intKeys.webhooks(qs),
    queryFn: ({ signal }) => fetchWebhooks(qs, signal),
    initialData: initial && initial.qs === qs ? { items: initial.items } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const all = useQuery({ queryKey: intKeys.webhooks('status=all'), queryFn: ({ signal }) => fetchWebhooks('status=all', signal), staleTime: 60_000 });
  const hostById = useMemo(() => new Map((all.data?.items ?? []).map((w) => [w.id, w.host])), [all.data]);

  const columns = useMemo<ColumnDef<WebhookItem>[]>(
    () => [
      {
        id: 'url',
        header: 'Uç nokta',
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const w = row.original;
          let path = '';
          try {
            path = new URL(w.url).pathname;
          } catch {
            path = '';
          }
          return (
            <div className="min-w-0">
              <p className="break-all font-mono text-sm">
                <span className="font-semibold text-fg">{w.host}</span>
                <span className="text-fg-muted">{path}</span>
              </p>
              {w.description ? <p className="text-xs text-fg-muted">{w.description}</p> : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Durum',
        meta: { mobile: 'field', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge
            size="sm"
            tone={row.original.disabledReason === 'auto_failures' ? 'danger' : WEBHOOK_STATUS_META[row.original.status].tone}
            label={row.original.disabledReason === 'auto_failures' ? 'Otomatik durduruldu' : WEBHOOK_STATUS_META[row.original.status].label}
          />
        ),
      },
      { id: 'events', header: 'Olaylar', meta: { mobile: 'field', label: 'Olaylar' } satisfies DataTableColumnMeta, cell: ({ row }) => <EventChips w={row.original} /> },
      {
        id: 'health',
        header: 'Son 24 saat',
        meta: { mobile: 'field', label: 'Son 24 saat' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const h = healthSummary(row.original.health24h);
          return <StatusBadge size="sm" tone={h.tone} label={h.label} />;
        },
      },
      {
        id: 'last',
        header: 'Son teslim',
        meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const h = row.original.health7d;
          return h.lastAt ? (
            <time dateTime={h.lastAt} title={fmtAbs(h.lastAt)} className="whitespace-nowrap text-sm text-fg-muted">
              {fmtRel(h.lastAt)}
            </time>
          ) : (
            <span className="text-sm text-fg-muted"><AdminEntegrasyonlarText k="noDelivery7d" /></span>
          );
        },
      },
      {
        id: 'partner',
        header: 'Partner',
        meta: { mobile: 'hidden' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm text-fg-muted">{row.original.partner?.label ?? '—'}</span>,
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Webhook'lar"
        description="Olaylar gerçekleştiğinde imzalı (HMAC-SHA256, zaman damgalı) POST. Geçici hatada 3 deneme; art arda 15 hatada uç otomatik duraklatılır."
        actions={
          <Button className="min-h-11 sm:min-h-10" onClick={() => set({ create: 'webhook' }, { history: 'push' })}>
            <Plus className="h-4 w-4" aria-hidden /> Yeni webhook
          </Button>
        }
      >
        <div className="space-y-4">
          <FilterBar fields={FIELDS} />
          <DataTable
            ariaLabel="Webhook'lar"
            columns={columns}
            data={list.data?.items}
            query={list}
            getRowId={(r) => r.id}
            getRowLabel={(r) => r.host}
            filtered={Boolean(sp.get('wq') || (sp.get('wstatus') && sp.get('wstatus') !== 'active'))}
            onRowClick={(r) => sheet.open(r.id)}
            activeRowId={sheet.id}
            empty={{
              icon: WebhookIcon,
              title: 'Etkin webhook yok',
              description: 'Yeni geri bildirimleri ya da kriz radarı olaylarını CRM, Slack köprüsü veya kendi sisteminize anında iletin.',
              action: (
                <Button className="min-h-11" onClick={() => set({ create: 'webhook' }, { history: 'push' })}>
                  <Plus className="h-4 w-4" aria-hidden /> Yeni webhook
                </Button>
              ),
            }}
          />
        </div>
      </SectionCard>

      <SectionCard title="Teslim günlüğü" description="Tüm uçların en yeni teslimleri. Satıra dokunarak gövdeyi ve yanıtı görün, gerekirse yeniden gönderin.">
        <DeliveryLog hostOf={(id) => hostById.get(id) ?? null} />
      </SectionCard>

      <DetailSheet paramKey="webhook" size="lg" title="Webhook ayrıntısı" siblings={list.data?.items.map((r) => r.id)}>
        {(id: string) => <WebhookDetailView id={id} />}
      </DetailSheet>

      <WebhookFormDialog open={creating} onOpenChange={(v) => set(v ? { create: 'webhook' } : { create: null, partner: null })} presetPartnerId={get('partner')} />
    </div>
  );
}

function WebhookDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: intKeys.webhook(id), queryFn: ({ signal }) => fetchWebhook(id, signal), staleTime: 10_000 });
  const [dialog, setDialog] = useState<'edit' | 'rotate' | null>(null);
  const patch = useMutation({
    mutationFn: (input: Parameters<typeof updateWebhook>[1]) => updateWebhook(id, input),
    onSuccess: (w) => {
      toast.success(w.status === 'active' ? 'Webhook etkin.' : w.status === 'archived' ? 'Webhook arşivlendi.' : 'Webhook duraklatıldı.');
      void qc.invalidateQueries({ queryKey: intKeys.all });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <QueryState query={detail} skeleton="detail">
      {(d) => {
        const w = d.webhook;
        const archived = w.status === 'archived';
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="break-all font-mono text-sm text-fg">{w.url}</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={WEBHOOK_STATUS_META[w.status].tone} label={WEBHOOK_STATUS_META[w.status].label} />
                <EventChips w={w} />
              </div>
            </div>

            {w.disabledReason ? (
              <p className={cn('flex items-start gap-2 rounded-card border p-3 text-sm', TONE_CALLOUT[w.disabledReason === 'auto_failures' ? 'danger' : 'warning'])}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {DISABLED_REASON_LABEL[w.disabledReason] ?? w.disabledReason}
              </p>
            ) : null}
            {w.deadEvents.length ? (
              <p className={cn('rounded-card border p-3 text-sm', TONE_CALLOUT.warning)}>
                Hiç tetiklenmeyen eski abonelikler: <span className="font-mono">{w.deadEvents.join(', ')}</span>. “Düzenle” ile kaydedince temizlenir.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {!archived ? (
                <>
                  <Button variant="outline" className="min-h-11" onClick={() => setDialog('edit')}>
                    <Pencil className="h-4 w-4" aria-hidden /> Düzenle
                  </Button>
                  {w.status === 'active' ? (
                    <Button variant="outline" className="min-h-11" disabled={patch.isPending} onClick={() => patch.mutate({ isActive: false })}>
                      <Pause className="h-4 w-4" aria-hidden /> Duraklat
                    </Button>
                  ) : (
                    <Button variant="outline" className="min-h-11" disabled={patch.isPending} onClick={() => patch.mutate({ isActive: true })}>
                      <Play className="h-4 w-4" aria-hidden /> Etkinleştir
                    </Button>
                  )}
                  <Button variant="outline" className="min-h-11" onClick={() => setDialog('rotate')}>
                    <KeySquare className="h-4 w-4" aria-hidden /> Sırrı döndür
                  </Button>
                  <ConfirmAction
                    tone="warning"
                    title="Webhook arşivlensin mi?"
                    description={`${w.host} artık olay almaz. Teslim geçmişi korunur; arşivden geri alınabilir.`}
                    irreversibleNote={false}
                    confirmLabel="Arşivle"
                    onConfirm={() => patch.mutateAsync({ archived: true })}
                    trigger={
                      <Button variant="outline" className="min-h-11">
                        <Archive className="h-4 w-4" aria-hidden /> Arşivle
                      </Button>
                    }
                  />
                </>
              ) : (
                <Button variant="outline" className="min-h-11" disabled={patch.isPending} onClick={() => patch.mutate({ archived: false })}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden /> Arşivden çıkar (duraklatılmış olarak)
                </Button>
              )}
            </div>

            <KeyValueList
              items={[
                { label: 'İmza sırrı', value: w.hasSecret ? `Tanımlı · …${w.secretHint ?? '????'}` : 'Yok — imzasız gönderilir; “Sırrı döndür” ile oluşturun' },
                { label: 'Son 24 saat', value: healthSummary(w.health24h).label },
                { label: 'Son 7 gün', value: healthSummary(w.health7d).label, hint: w.health7d.lastError ?? undefined },
                { label: 'Partner', value: w.partner?.label ?? 'Partnersiz' },
                { label: 'Oluşturan', value: `${w.createdBy ?? 'Silinmiş kullanıcı'} · ${fmtAbs(w.createdAt)}` },
              ]}
            />

            {!archived ? (
              <section aria-labelledby={`test-${id}`} className="space-y-2">
                <h3 id={`test-${id}`} className="text-sm font-semibold text-fg">
                  Test
                </h3>
                <TestPanel webhookId={w.id} />
              </section>
            ) : null}

            <section aria-labelledby={`dl-${id}`} className="space-y-2">
              <h3 id={`dl-${id}`} className="text-sm font-semibold text-fg">
                Teslimler
              </h3>
              <DeliveryLog webhookId={w.id} canResend={!archived} />
            </section>

            <section aria-labelledby={`au-${id}`} className="space-y-2">
              <h3 id={`au-${id}`} className="text-sm font-semibold text-fg">
                Etkinlik
              </h3>
              <Timeline dense events={d.audit.map((a) => ({ id: a.id, title: a.label, description: a.detail ?? undefined, at: a.at, actor: a.actor ?? undefined }))} emptyLabel="Denetim kaydı yok." />
            </section>

            <WebhookFormDialog open={dialog === 'edit'} onOpenChange={(v) => setDialog(v ? 'edit' : null)} item={w} />
            <RotateSecretDialog item={w} open={dialog === 'rotate'} onOpenChange={(v) => setDialog(v ? 'rotate' : null)} />
          </div>
        );
      }}
    </QueryState>
  );
}
