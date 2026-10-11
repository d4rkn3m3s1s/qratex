'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Building2, Briefcase, KeyRound, Loader2, Pencil, Plus, Power, Webhook as WebhookIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterBar, SectionCard, useUrlState, type FilterField } from '@/components/ds/page';
import { DataTable, DetailSheet, KeyValueList, StatusBadge, Timeline, useDetailSheet, type DataTableColumnMeta } from '@/components/ds/data';
import { ConfirmAction, InlineError, QueryState, TONE_CALLOUT } from '@/components/states';
import { PARTNER_TYPES, WEBHOOK_EVENTS, type DealerOption, type PartnerItem, type PartnerType, type WebhookEventKey } from '@/lib/integrations/contract';
import { cn } from '@/lib/utils';
import { partnerQs } from './qs';
import { createPartner, dealersByIds, errorText, fetchPartner, fetchPartners, fieldErrors, intKeys, updatePartner } from './api';
import { DealerPicker } from './dealer-picker';
import { SecretReveal } from './secret-reveal';
import { KEY_STATUS_META, PARTNER_STATUS_META, WEBHOOK_STATUS_META, fmtAbs, fmtRel, healthSummary } from './format';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'pq', label: 'Ara', placeholder: 'Partner adı' },
  {
    type: 'select',
    key: 'pstatus',
    label: 'Durum',
    allLabel: null,
    defaultValue: 'active',
    options: [
      { value: 'active', label: 'Etkin' },
      { value: 'inactive', label: 'Pasif' },
      { value: 'archived', label: 'Arşiv' },
      { value: 'all', label: 'Tümü' },
    ],
  },
  { type: 'select', key: 'ptype', label: 'Tür', allLabel: 'Tüm türler', options: PARTNER_TYPES.map((t) => ({ value: t.value, label: t.label })) },
];

/** Partnerler: anahtar ve webhook'ların sahibi; bağlı bayiler, pasifleştirme anahtarları da keser. */
export function PartnersTab({ initial }: { initial: { qs: string; items: PartnerItem[] } | null }) {
  const sp = useSearchParams();
  const { get, set } = useUrlState();
  const qs = partnerQs((k) => sp.get(k));
  const sheet = useDetailSheet('partnerId');
  const creating = get('create') === 'partner';

  const list = useQuery({
    queryKey: intKeys.partners(qs),
    queryFn: ({ signal }) => fetchPartners(qs, signal),
    initialData: initial && initial.qs === qs ? { items: initial.items } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<PartnerItem>[]>(
    () => [
      {
        id: 'name',
        header: 'Partner',
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{row.original.name}</p>
            <p className="text-xs text-fg-muted">{row.original.typeLabel}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        meta: { mobile: 'field', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" tone={PARTNER_STATUS_META[row.original.status].tone} label={PARTNER_STATUS_META[row.original.status].label} />,
      },
      {
        id: 'keys',
        header: 'Anahtarlar',
        meta: { mobile: 'field', label: 'Anahtarlar' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.activeKeys} etkin
            <span className="block text-xs text-fg-muted">{row.original.lastKeyUseAt ? `son çağrı ${fmtRel(row.original.lastKeyUseAt)}` : 'hiç çağrı yok'}</span>
          </span>
        ),
      },
      {
        id: 'hooks',
        header: 'Webhook sağlığı (24 sa)',
        meta: { mobile: 'field', label: 'Webhook' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          if (row.original.webhooks === 0) return <span className="text-sm text-fg-muted">Webhook yok</span>;
          const h = healthSummary(row.original.webhookHealth24h);
          return <StatusBadge size="sm" tone={h.tone} label={`${row.original.webhooks} uç · ${h.label}`} />;
        },
      },
      {
        id: 'dealers',
        header: 'Bağlı bayi',
        meta: { mobile: 'field', label: 'Bağlı bayi' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm text-fg-muted">{row.original.dealerIds.length ? row.original.dealerIds.length : 'Kısıtsız'}</span>,
      },
      {
        id: 'created',
        header: 'Oluşturma',
        meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <time dateTime={row.original.createdAt} className="whitespace-nowrap text-sm text-fg-muted">{fmtAbs(row.original.createdAt)}</time>,
      },
    ],
    []
  );

  return (
    <SectionCard
      title="Partnerler"
      description="POS, ajans ve dijital menü entegratörleri. Anahtarlar ve webhook'lar partnere bağlanır; partner pasifleşince anahtarları reddedilir ve webhook'ları durur."
      actions={
        <Button className="min-h-11 sm:min-h-10" onClick={() => set({ create: 'partner' }, { history: 'push' })}>
          <Plus className="h-4 w-4" aria-hidden /> Yeni partner
        </Button>
      }
    >
      <div className="space-y-4">
        <FilterBar fields={FIELDS} />
        <DataTable
          ariaLabel="Partnerler"
          columns={columns}
          data={list.data?.items}
          query={list}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.name}
          filtered={Boolean(sp.get('pq') || sp.get('ptype') || (sp.get('pstatus') && sp.get('pstatus') !== 'active'))}
          onRowClick={(r) => sheet.open(r.id)}
          activeRowId={sheet.id}
          empty={{
            icon: Briefcase,
            title: 'Etkin partner yok',
            description: 'Bir POS ya da dijital menü entegratörünü kaydedin; ardından ona kapsamlı bir anahtar ve webhook bağlayın.',
            action: (
              <Button className="min-h-11" onClick={() => set({ create: 'partner' }, { history: 'push' })}>
                <Plus className="h-4 w-4" aria-hidden /> Yeni partner
              </Button>
            ),
          }}
        />
      </div>

      <DetailSheet paramKey="partnerId" size="lg" title="Partner ayrıntısı" siblings={list.data?.items.map((r) => r.id)}>
        {(id: string) => <PartnerDetailView id={id} />}
      </DetailSheet>

      <PartnerFormDialog open={creating} onOpenChange={(v) => set({ create: v ? 'partner' : null })} />
    </SectionCard>
  );
}

function PartnerFormDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (v: boolean) => void; item?: PartnerItem }) {
  const qc = useQueryClient();
  const id = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<PartnerType>('POS');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const known = useQuery({
    queryKey: ['admin-integrations', 'dealers-by-id', item?.dealerIds.join(',') ?? ''],
    queryFn: ({ signal }) => dealersByIds(item?.dealerIds ?? [], signal),
    enabled: open && Boolean(item?.dealerIds.length),
  });

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setType((item?.type as PartnerType) ?? 'POS');
    setContactName(item?.contactName ?? '');
    setContactEmail(item?.contactEmail ?? '');
    setNotes(item?.notes ?? '');
    setDealers([]);
    setErrs({});
  }, [open, item]);
  useEffect(() => {
    if (known.data) setDealers(known.data.items);
  }, [known.data]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), type, contactName: contactName.trim(), contactEmail: contactEmail.trim(), notes: notes.trim(), dealerIds: dealers.map((d) => d.id) };
      if (item) return (await updatePartner(item.id, body)).partner;
      return createPartner(body);
    },
    onSuccess: () => {
      toast.success(item ? 'Partner güncellendi.' : 'Partner oluşturuldu. Şimdi ona bir anahtar bağlayabilirsiniz.');
      void qc.invalidateQueries({ queryKey: intKeys.all });
      onOpenChange(false);
    },
    onError: (e) => setErrs(fieldErrors(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Partneri düzenle' : 'Yeni partner'}</DialogTitle>
          <DialogDescription>Partner kaydı kimlik bilgisi üretmez; anahtarı “Anahtar bağla” ile kapsamlı ve süreli olarak verirsiniz.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErrs({});
            if (name.trim().length < 2) return setErrs({ name: 'Ad en az 2 karakter olmalı.' });
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>Ad</Label>
            <Input id={`${id}-name`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className="min-h-11" aria-invalid={Boolean(errs.name)} aria-describedby={errs.name ? `${id}-ne` : undefined} autoFocus />
            {errs.name ? (
              <p id={`${id}-ne`} className="text-xs text-danger">
                {errs.name}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-type`}>Tür</Label>
            <Select value={type} onValueChange={(v) => setType(v as PartnerType)}>
              <SelectTrigger id={`${id}-type`} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-cn`}>İrtibat kişisi</Label>
              <Input id={`${id}-cn`} value={contactName} maxLength={100} onChange={(e) => setContactName(e.target.value)} className="min-h-11" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-ce`}>İrtibat e-postası</Label>
              <Input id={`${id}-ce`} type="email" value={contactEmail} maxLength={200} onChange={(e) => setContactEmail(e.target.value)} className="min-h-11" autoComplete="off" aria-invalid={Boolean(errs.contactEmail)} />
              {errs.contactEmail ? <p className="text-xs text-danger">{errs.contactEmail}</p> : null}
            </div>
          </div>
          <DealerPicker
            multiple
            label="Bağlı bayiler (isteğe bağlı)"
            description="Seçilirse bu partnerin anahtarları yalnız bu bayilerin verisini okuyabilir."
            value={dealers}
            onChange={setDealers}
            disabled={known.isLoading}
          />
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-notes`}>Notlar</Label>
            <Textarea id={`${id}-notes`} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {save.isError && Object.keys(fieldErrors(save.error)).length === 0 ? <InlineError>{errorText(save.error)}</InlineError> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
              {item ? 'Kaydet' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Eski serbest metin webhookUrl → gerçek abonelik (sır bir kez gösterilir). */
function LegacyWebhookMigration({ partnerId, url }: { partnerId: string; url: string }) {
  const qc = useQueryClient();
  const id = useId();
  const [events, setEvents] = useState<WebhookEventKey[]>(['feedback.created']);
  const [secret, setSecret] = useState<string | null>(null);
  const migrate = useMutation({
    mutationFn: () => updatePartner(partnerId, { migrateLegacyWebhook: { events } }),
    onSuccess: (r) => {
      setSecret(r.webhookSecret);
      void qc.invalidateQueries({ queryKey: intKeys.all });
    },
  });
  if (secret) {
    return <SecretReveal label="Yeni webhook imza sırrı" value={secret} onDone={() => setSecret(null)} warning="Webhook oluşturuldu. Bu imza sırrını partnere iletin; bir daha gösterilmez." />;
  }
  return (
    <div className={cn('space-y-3 rounded-card border p-3 text-sm', TONE_CALLOUT.warning)}>
      <p>
        Bu partnerin eski kaydında serbest metin bir webhook adresi var (<span className="break-all font-mono">{url}</span>). Bu adrese hiçbir zaman olay gönderilmedi. Gerçek, imzalı bir aboneliğe dönüştürün:
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Olaylar</legend>
        {WEBHOOK_EVENTS.map((ev) => (
          <div key={ev.key} className="flex items-center gap-2">
            <Checkbox id={`${id}-${ev.key}`} checked={events.includes(ev.key)} onCheckedChange={(v) => setEvents(v === true ? [...new Set([...events, ev.key])] : events.filter((x) => x !== ev.key))} />
            <Label htmlFor={`${id}-${ev.key}`} className="cursor-pointer">
              {ev.label}
            </Label>
          </div>
        ))}
      </fieldset>
      {migrate.isError ? <InlineError>{errorText(migrate.error)}</InlineError> : null}
      <Button className="min-h-11" disabled={events.length === 0 || migrate.isPending} onClick={() => migrate.mutate()} aria-busy={migrate.isPending}>
        {migrate.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <WebhookIcon className="h-4 w-4" aria-hidden />}
        Webhook aboneliğine dönüştür
      </Button>
    </div>
  );
}

function PartnerDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const { set } = useUrlState();
  const detail = useQuery({ queryKey: intKeys.partner(id), queryFn: ({ signal }) => fetchPartner(id, signal), staleTime: 10_000 });
  const [editing, setEditing] = useState(false);
  const patch = useMutation({
    mutationFn: (input: Parameters<typeof updatePartner>[1]) => updatePartner(id, input),
    onSuccess: (r) => {
      toast.success(r.partner.status === 'active' ? 'Partner etkin.' : r.partner.status === 'archived' ? 'Partner arşivlendi.' : 'Partner pasifleştirildi.');
      void qc.invalidateQueries({ queryKey: intKeys.all });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <QueryState query={detail} skeleton="detail">
      {(d) => {
        const p = d.partner;
        const usable = p.status === 'active';
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-fg">{p.name}</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={PARTNER_STATUS_META[p.status].tone} label={PARTNER_STATUS_META[p.status].label} />
                <StatusBadge tone="neutral" icon={null} label={p.typeLabel} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {p.status !== 'archived' ? (
                <Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Düzenle
                </Button>
              ) : null}
              {p.status === 'active' ? (
                <ConfirmAction
                  tone="warning"
                  title={`${p.name} pasifleştirilsin mi?`}
                  description="Bu partnere bağlı tüm API anahtarları bir sonraki istekte 403 alır ve webhook'ları duraklatılır. Yeniden etkinleştirince webhook'lar devam eder."
                  impact={[
                    { label: 'Etkin anahtar', value: p.activeKeys },
                    { label: 'Webhook', value: p.webhooks },
                  ]}
                  irreversibleNote={false}
                  confirmLabel="Pasifleştir"
                  onConfirm={() => patch.mutateAsync({ isActive: false })}
                  trigger={
                    <Button variant="outline" className="min-h-11">
                      <Power className="h-4 w-4" aria-hidden /> Pasifleştir
                    </Button>
                  }
                />
              ) : p.status === 'inactive' ? (
                <Button variant="outline" className="min-h-11" disabled={patch.isPending} onClick={() => patch.mutate({ isActive: true })}>
                  <Power className="h-4 w-4" aria-hidden /> Etkinleştir
                </Button>
              ) : null}
              {p.status !== 'archived' ? (
                <ConfirmAction
                  tone="warning"
                  title={`${p.name} arşivlensin mi?`}
                  description="Partner listeden kalkar ve pasifleşir; kayıt, anahtar geçmişi ve denetim izi silinmez."
                  irreversibleNote={false}
                  confirmLabel="Arşivle"
                  onConfirm={() => patch.mutateAsync({ archived: true })}
                  trigger={
                    <Button variant="outline" className="min-h-11">
                      <Archive className="h-4 w-4" aria-hidden /> Arşivle
                    </Button>
                  }
                />
              ) : (
                <Button variant="outline" className="min-h-11" disabled={patch.isPending} onClick={() => patch.mutate({ archived: false })}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden /> Arşivden çıkar (pasif)
                </Button>
              )}
            </div>

            {p.legacyWebhookUrl ? <LegacyWebhookMigration partnerId={p.id} url={p.legacyWebhookUrl} /> : null}
            {p.hasLegacyKey ? (
              <div className={cn('flex flex-col gap-2 rounded-card border p-3 text-sm sm:flex-row sm:items-center', TONE_CALLOUT.info)}>
                <p className="flex-1">Eski sistemde üretilen qrk_ anahtarının özeti duruyor. Bu anahtar hiçbir uçta doğrulanmadı ve çalışmaz; kaydı temizleyin ve gerekirse yeni anahtar bağlayın.</p>
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={patch.isPending} onClick={() => patch.mutate({ clearLegacyKey: true })}>
                  Eski anahtarı temizle
                </Button>
              </div>
            ) : null}

            <KeyValueList
              items={[
                { label: 'İrtibat', value: [p.contactName, p.contactEmail].filter(Boolean).join(' · ') || '—' },
                { label: 'Notlar', value: p.notes || '—' },
                { label: 'Oluşturma', value: fmtAbs(p.createdAt) },
              ]}
            />

            <section className="space-y-2" aria-labelledby={`pk-${id}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 id={`pk-${id}`} className="text-sm font-semibold text-fg">
                  API anahtarları
                </h3>
                {usable ? (
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => set({ tab: 'anahtarlar', create: 'key', partner: p.id, partnerId: null }, { history: 'push' })}>
                    <KeyRound className="h-4 w-4" aria-hidden /> Anahtar bağla
                  </Button>
                ) : null}
              </div>
              {d.keys.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu partnere bağlı anahtar yok.</p>
              ) : (
                <ul className="divide-y divide-border rounded-card border border-border">
                  {d.keys.map((k) => (
                    <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="font-medium">{k.name}</span>
                      <span className="font-mono text-xs text-fg-muted">{k.display}</span>
                      <StatusBadge size="sm" tone={KEY_STATUS_META[k.status].tone} label={KEY_STATUS_META[k.status].label} />
                      <span className="ml-auto text-xs text-fg-muted">{k.lastUsedAt ? `son çağrı ${fmtRel(k.lastUsedAt)}` : 'hiç kullanılmadı'}</span>
                      <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => set({ tab: 'anahtarlar', key: k.id, kstatus: 'all', partnerId: null }, { history: 'push' })}>
                        Aç
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2" aria-labelledby={`pw-${id}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 id={`pw-${id}`} className="text-sm font-semibold text-fg">
                  Webhook'lar
                </h3>
                {usable ? (
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => set({ tab: 'webhooklar', create: 'webhook', partner: p.id, partnerId: null }, { history: 'push' })}>
                    <WebhookIcon className="h-4 w-4" aria-hidden /> Webhook ekle
                  </Button>
                ) : null}
              </div>
              {d.webhooks.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu partnere bağlı webhook yok.</p>
              ) : (
                <ul className="divide-y divide-border rounded-card border border-border">
                  {d.webhooks.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="break-all font-mono text-xs">{w.host}</span>
                      <StatusBadge size="sm" tone={WEBHOOK_STATUS_META[w.status].tone} label={WEBHOOK_STATUS_META[w.status].label} />
                      <StatusBadge size="sm" tone={healthSummary(w.health24h).tone} label={healthSummary(w.health24h).label} />
                      <Button size="sm" variant="ghost" className="ml-auto min-h-11 sm:min-h-9" onClick={() => set({ tab: 'webhooklar', webhook: w.id, wstatus: 'all', partnerId: null }, { history: 'push' })}>
                        Aç
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2" aria-labelledby={`pd-${id}`}>
              <h3 id={`pd-${id}`} className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Building2 className="h-4 w-4" aria-hidden /> Bağlı bayiler
              </h3>
              {d.dealers.length === 0 ? (
                <p className="text-sm text-fg-muted">Kısıt yok: platform geneli anahtarlar tüm bayileri okuyabilir. Kısıtlamak için “Düzenle”den bayi seçin.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {d.dealers.map((x) => (
                    <li key={x.id}>
                      <StatusBadge size="sm" tone="neutral" icon={null} label={x.label} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2" aria-labelledby={`pa-${id}`}>
              <h3 id={`pa-${id}`} className="text-sm font-semibold text-fg">
                Etkinlik
              </h3>
              <Timeline dense events={d.audit.map((a) => ({ id: a.id, title: a.label, description: a.detail ?? undefined, at: a.at, actor: a.actor ?? undefined }))} emptyLabel="Denetim kaydı yok." />
            </section>

            <PartnerFormDialog open={editing} onOpenChange={setEditing} item={p} />
          </div>
        );
      }}
    </QueryState>
  );
}
