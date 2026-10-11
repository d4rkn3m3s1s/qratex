'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import type { ColumnDef } from '@tanstack/react-table';
import { z } from 'zod';
import { toast } from 'sonner';
import { Copy, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, StatusBadge, statusBadgeProps, type DataTableColumnMeta } from '@/components/ds/data';
import { EntityEditorSheet, NumberField, SwitchField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import { ConfirmAction } from '@/components/states';
import {
  isoToIstanbulInput,
  istanbulInputToIso,
  MAX_SPONSORED,
  newSponsorId,
  sponsoredSchema,
  sponsorStatus,
  type Sponsored,
} from '@/lib/admin-discovery/contract';
import { errorText, uploadImage } from '../api';
import { fmtDateTime, fmtNumber, SPONSOR_STATUS } from '../format';
import { useDiscoveryDraft } from './discovery-center';
import { DealerPicker } from './dealer-picker';
import { AdminKesifBagisText } from '../copy';

const sponsorFormSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    discountRate: z.number().nullable(),
    linkUrl: z.string(),
    dealerId: z.string(),
    imageUrl: z.string(),
    priority: z.number().nullable(),
    isActive: z.boolean(),
    startsLocal: z.string(),
    endsLocal: z.string(),
  })
  .superRefine((v, ctx) => {
    const parsed = sponsoredSchema.safeParse(toSponsor(v));
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const key = i.path[0] === 'startsAt' ? 'startsLocal' : i.path[0] === 'endsAt' ? 'endsLocal' : i.path[0];
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key ?? 'title'], message: i.message });
      }
    }
  });
type SponsorForm = z.infer<typeof sponsorFormSchema>;

function toSponsor(v: SponsorForm) {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    discountRate: v.discountRate == null ? undefined : v.discountRate,
    linkUrl: v.linkUrl,
    dealerId: v.dealerId,
    imageUrl: v.imageUrl,
    priority: v.priority ?? 0,
    isActive: v.isActive,
    startsAt: v.startsLocal ? istanbulInputToIso(v.startsLocal) ?? 'geçersiz' : undefined,
    endsAt: v.endsLocal ? istanbulInputToIso(v.endsLocal) ?? 'geçersiz' : undefined,
  };
}

function toForm(s: Sponsored | null): SponsorForm {
  return {
    id: s?.id ?? newSponsorId(),
    title: s?.title ?? '',
    description: s?.description ?? '',
    discountRate: s?.discountRate ?? null,
    linkUrl: s?.linkUrl ?? '',
    dealerId: s?.dealerId ?? '',
    imageUrl: s?.imageUrl ?? '',
    priority: s?.priority ?? 0,
    isActive: s?.isActive ?? true,
    startsLocal: isoToIstanbulInput(s?.startsAt),
    endsLocal: isoToIstanbulInput(s?.endsAt),
  };
}

function windowText(s: Sponsored): string {
  if (!s.startsAt && !s.endsAt) return 'Süresiz';
  return `${s.startsAt ? fmtDateTime(s.startsAt) : 'Hemen'} → ${s.endsAt ? fmtDateTime(s.endsAt) : 'süresiz'}`;
}

/**
 * Sponsorlu duyurular — durum (Yayında/Planlandı/Bitti/Kapalı), İstanbul saatli tarih seçici,
 * bayi seçici (yalnız DEALER), güvenli bağlantı (https ya da uygulama içi), R2 görsel, 0–100
 * indirim. Kimlik sistemce üretilir ve değişmez (eski "id" alanı her tuşta odağı kaybediyordu).
 * Gösterim/tıklama ölçümü olmadığı için CTR gösterilmez (uydurulmaz).
 */
export function SponsoredTab() {
  const { draft, update, dealers } = useDiscoveryDraft();
  const [editor, setEditor] = useState<{ open: boolean; id: string | null; copyOf: Sponsored | null }>({ open: false, id: null, copyOf: null });
  const now = new Date();
  const columns = useMemo<ColumnDef<Sponsored>[]>(
    () => [
      {
        id: 'title',
        header: 'Duyuru',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Duyuru' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex min-w-[14rem] items-center gap-3">
            {row.original.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.original.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" loading="lazy" />
            ) : null}
            <div className="min-w-0">
              <span className="block truncate font-medium text-fg">{row.original.title}</span>
              <span className="block truncate text-xs text-fg-muted">{row.original.description || '—'}</span>
            </div>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(SPONSOR_STATUS, sponsorStatus(row.original, now))} />,
      },
      {
        id: 'dealer',
        header: 'İşletme',
        enableSorting: false,
        meta: { label: 'İşletme' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.dealerId ? dealers[row.original.dealerId]?.name ?? <span className="text-danger"><AdminKesifBagisText k="dealerNotFound" /></span> : <span className="text-fg-muted">Genel</span>),
      },
      {
        id: 'discount',
        header: 'İndirim',
        enableSorting: false,
        meta: { numeric: true, label: 'İndirim' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.discountRate ? `%${fmtNumber(row.original.discountRate)}` : '—'),
      },
      {
        id: 'priority',
        header: 'Öncelik',
        enableSorting: false,
        meta: { numeric: true, label: 'Öncelik' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.priority),
      },
      {
        id: 'window',
        header: 'Yayın aralığı',
        enableSorting: false,
        meta: { label: 'Yayın aralığı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm">{windowText(row.original)}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealers]
  );
  const full = draft.sponsored.length >= MAX_SPONSORED;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-fg-muted">
          Müşteri keşif yanıtında (`/api/customer/discovery`) yayındaki ilk 10 duyuru öncelik sırasıyla döner. Duyuru bağlantısı (`/customer/places?promo=…`) işletme bağlıysa o işletmenin sayfasını, değilse Fırsatlar’ı açar. Tarihler İstanbul saatidir; bitişi geçen
          duyuru kendiliğinden yayından kalkar.
        </p>
        <Button className="min-h-11 shrink-0 sm:min-h-10" disabled={full} onClick={() => setEditor({ open: true, id: null, copyOf: null })}>
          <Plus className="h-4 w-4" aria-hidden />
          Yeni duyuru
        </Button>
      </div>
      {full ? <p className="text-sm text-warning">En fazla {MAX_SPONSORED} duyuru tutulabilir; bitenleri silin.</p> : null}
      <DataTable
        ariaLabel="Sponsorlu duyurular"
        columns={columns}
        data={draft.sponsored}
        getRowId={(r) => r.id}
        onRowClick={(r) => setEditor({ open: true, id: r.id, copyOf: null })}
        paginated
        defaultPageSize={20}
        empty={{ variant: 'first-use', title: 'Sponsorlu duyuru yok', description: '“Yeni duyuru” ile ilk kampanyayı planlayın.' }}
      />
      <SponsorEditor
        open={editor.open}
        sponsor={editor.id ? draft.sponsored.find((s) => s.id === editor.id) ?? null : editor.copyOf}
        isNew={!editor.id}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        onDuplicate={(s) => setEditor({ open: true, id: null, copyOf: { ...s, id: newSponsorId(), title: `${s.title} (kopya)`.slice(0, 80), isActive: false } })}
        onDelete={(sid) => {
          update((d) => ({ ...d, sponsored: d.sponsored.filter((s) => s.id !== sid) }));
          setEditor({ open: false, id: null, copyOf: null });
          toast.success('Duyuru taslaktan silindi.');
        }}
        onSave={(s, isNew) => {
          update((d) => {
            const list = isNew ? [...d.sponsored, s] : d.sponsored.map((x) => (x.id === s.id ? s : x));
            return { ...d, sponsored: [...list].sort((a, b) => b.priority - a.priority) };
          });
          toast.success('Duyuru taslağa uygulandı.');
        }}
      />
    </div>
  );
}

function SponsorEditor({
  open,
  sponsor,
  isNew,
  onOpenChange,
  onSave,
  onDelete,
  onDuplicate,
}: {
  open: boolean;
  sponsor: Sponsored | null;
  isNew: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (s: Sponsored, isNew: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (s: Sponsored) => void;
}) {
  const id = useId();
  const { dealers, rememberDealer } = useDiscoveryDraft();
  const form = useZodForm<SponsorForm>(sponsorFormSchema as unknown as z.ZodType<SponsorForm>, { defaultValues: toForm(sponsor) });
  const { reset } = form;
  useEffect(() => {
    if (open) reset(toForm(sponsor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sponsor?.id]);

  return (
    <EntityEditorSheet<SponsorForm>
      open={open}
      onOpenChange={onOpenChange}
      mode={isNew ? 'create' : 'edit'}
      entityLabel="duyuru"
      title={isNew ? 'Yeni sponsorlu duyuru' : 'Duyuruyu düzenle'}
      description="Değişiklik taslağa uygulanır; müşteriye ulaşması için alttaki çubuktan yayınlayın."
      form={form}
      width="lg"
      submitLabel="Taslağa uygula"
      successToast={false}
      disableWhenPristine={!isNew}
      onSubmit={(v) => {
        onSave(sponsoredSchema.parse(toSponsor(v)), isNew);
        return true;
      }}
      footerStart={
        !isNew && sponsor ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onDuplicate(sponsor)}>
              <Copy className="h-4 w-4" aria-hidden />
              Çoğalt
            </Button>
            <ConfirmAction
              tone="warning"
              title="Duyuru silinsin mi?"
              description="Taslaktan kaldırılır; yayınlayana kadar müşteri görmeye devam eder. Önceki sürüm “Geçmiş”ten geri yüklenebilir."
              irreversibleNote={false}
              confirmLabel="Sil"
              trigger={
                <Button type="button" variant="ghost" className="min-h-11 text-danger">
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Sil
                </Button>
              }
              onConfirm={() => onDelete(sponsor.id)}
            />
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        <TextField control={form.control} name="title" label="Başlık" required maxLength={80} />
        <TextareaField control={form.control} name="description" label="Açıklama" optional maxLength={240} rows={3} />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField control={form.control} name="discountRate" label="İndirim" unit="%" min={0} max={100} optional description="Boş bırakılırsa indirim rozeti gösterilmez." />
          <NumberField control={form.control} name="priority" label="Öncelik" min={0} max={1000} description="Büyük olan önce gösterilir." />
        </div>
        <Controller
          control={form.control}
          name="dealerId"
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-dealer`}>
                İşletme <span className="font-normal text-fg-muted"><AdminKesifBagisText k="optional" /></span>
              </Label>
              <DealerPicker
                id={`${id}-dealer`}
                value={field.value || null}
                dealer={field.value ? dealers[field.value] : null}
                clearable
                invalid={!!fieldState.error}
                onChange={(d) => {
                  if (d) rememberDealer(d);
                  field.onChange(d?.id ?? '');
                }}
              />
              {fieldState.error ? (
                <p role="alert" className="text-sm text-danger">
                  {fieldState.error.message}
                </p>
              ) : (
                <p className="text-xs text-fg-muted"><AdminKesifBagisText k="linkHint" /></p>
              )}
            </div>
          )}
        />
        <TextField
          control={form.control}
          name="linkUrl"
          label="Bağlantı"
          optional
          type="url"
          inputMode="url"
          placeholder="https://… ya da /customer/…"
          description="Yalnız https:// ya da uygulama içi yol kabul edilir. Müşteri keşif yanıtında döner."
        />
        <ImageField control={form.control} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeInput control={form.control} name="startsLocal" label="Başlangıç (İstanbul)" />
          <DateTimeInput control={form.control} name="endsLocal" label="Bitiş (İstanbul)" />
        </div>
        <SwitchField control={form.control} name="isActive" label="Etkin" description="Kapalıyken tarih aralığında olsa bile yayınlanmaz." variant="card" />
        <StatusPreview control={form.control} />
      </div>
    </EntityEditorSheet>
  );
}

function StatusPreview({ control }: { control: Control<SponsorForm> }) {
  const [isActive, s, e] = useWatch({ control, name: ['isActive', 'startsLocal', 'endsLocal'] });
  const st = sponsorStatus({ isActive, startsAt: s ? istanbulInputToIso(s) : undefined, endsAt: e ? istanbulInputToIso(e) : undefined });
  return (
    <p className="flex items-center gap-2 text-sm text-fg-muted">
      Yayınlanınca durumu: <StatusBadge size="sm" {...statusBadgeProps(SPONSOR_STATUS, st)} />
    </p>
  );
}

function DateTimeInput({ control, name, label }: { control: Control<SponsorForm>; name: 'startsLocal' | 'endsLocal'; label: string }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {label} <span className="font-normal text-fg-muted"><AdminKesifBagisText k="optional" /></span>
          </Label>
          <Input
            id={id}
            type="datetime-local"
            className="min-h-11"
            value={field.value ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            aria-invalid={fieldState.error ? true : undefined}
            aria-describedby={fieldState.error ? `${id}-e` : undefined}
          />
          {fieldState.error ? (
            <p id={`${id}-e`} role="alert" className="text-sm text-danger">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

function ImageField({ control }: { control: Control<SponsorForm> }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Controller
      control={control}
      name="imageUrl"
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            Görsel <span className="font-normal text-fg-muted"><AdminKesifBagisText k="optional" /></span>
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {field.value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={field.value} alt="Duyuru görseli önizlemesi" className="h-16 w-16 shrink-0 rounded-md border border-border object-cover" />
            ) : null}
            <Input id={id} className="min-h-11" placeholder="https://…" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                setError(null);
                try {
                  field.onChange(await uploadImage(file, 'rewards'));
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={busy} aria-busy={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
              Yükle
            </Button>
          </div>
          {fieldState.error || error ? (
            <p role="alert" className="text-sm text-danger">
              {fieldState.error?.message ?? error}
            </p>
          ) : (
            <p className="text-xs text-fg-muted"><AdminKesifBagisText k="imageHint" /></p>
          )}
        </div>
      )}
    />
  );
}
