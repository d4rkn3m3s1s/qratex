'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import type { ColumnDef } from '@tanstack/react-table';
import { z } from 'zod';
import { toast } from 'sonner';
import { Crosshair, MapPinned, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { EntityEditorSheet, NumberField, TextField, useZodForm } from '@/components/ds/form';
import { useUrlState } from '@/components/ds/page';
import { ConfirmAction, InlineError } from '@/components/states';
import {
  discoveryLocationSchema,
  MAX_CATEGORIES,
  parseCoordinates,
  SUGGESTED_CATEGORIES,
  WEEKDAYS,
  type DealerRef,
  type DiscoveryLocation,
} from '@/lib/admin-discovery/contract';
import { useDiscoveryDraft } from './discovery-center';
import { DealerPicker } from './dealer-picker';
import { fmtDecimal } from '../format';

const TIME = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Saat SS:dd olmalı.')]);

/** Form değeri: sayı alanları `number | null`, saatler boş metin olabilir; çıkışta sözleşmeye çevrilir. */
const locationFormSchema = z
  .object({
    dealerId: z.string().min(1, 'Bir işletme seçin.'),
    latitude: z.number({ invalid_type_error: 'Enlem gerekli.' }).nullable().refine((v) => v !== null, 'Enlem gerekli.'),
    longitude: z.number({ invalid_type_error: 'Boylam gerekli.' }).nullable().refine((v) => v !== null, 'Boylam gerekli.'),
    address: z.string().max(200, 'Adres en fazla 200 karakter.'),
    categories: z.array(z.string()).max(MAX_CATEGORIES, `En fazla ${MAX_CATEGORIES} kategori.`),
    opensAt: TIME,
    closesAt: TIME,
    daysOfWeek: z.array(z.number()),
  })
  .superRefine((v, ctx) => {
    const parsed = discoveryLocationSchema.safeParse(toLocation(v));
    if (!parsed.success) {
      for (const i of parsed.error.issues) ctx.addIssue({ code: z.ZodIssueCode.custom, path: i.path, message: i.message });
    }
  });
type LocationForm = {
  dealerId: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  categories: string[];
  opensAt: string;
  closesAt: string;
  daysOfWeek: number[];
};

function toLocation(v: {
  dealerId: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  categories: string[];
  opensAt: string;
  closesAt: string;
  daysOfWeek: number[];
}) {
  return {
    dealerId: v.dealerId,
    latitude: v.latitude ?? Number.NaN,
    longitude: v.longitude ?? Number.NaN,
    address: v.address.trim() || undefined,
    categories: v.categories,
    opensAt: v.opensAt || undefined,
    closesAt: v.closesAt || undefined,
    daysOfWeek: v.daysOfWeek,
  };
}

function toForm(l: DiscoveryLocation | null, dealerId = ''): LocationForm {
  return {
    dealerId: l?.dealerId ?? dealerId,
    latitude: l ? l.latitude : null,
    longitude: l ? l.longitude : null,
    address: l?.address ?? '',
    categories: l?.categories ?? [],
    opensAt: l?.opensAt ?? '',
    closesAt: l?.closesAt ?? '',
    daysOfWeek: l?.daysOfWeek ?? [],
  };
}

const dayShort = (d: number) => WEEKDAYS.find((w) => w.value === d)?.short ?? String(d);
function hoursText(l: DiscoveryLocation): string {
  if (!l.opensAt || !l.closesAt) return 'Saat yok';
  const days = l.daysOfWeek.length === 7 || l.daysOfWeek.length === 0 ? 'Her gün' : WEEKDAYS.filter((w) => l.daysOfWeek.includes(w.value)).map((w) => w.short).join(' ');
  const overnight = l.closesAt <= l.opensAt ? ' (ertesi gün)' : '';
  return `${days} ${l.opensAt}–${l.closesAt}${overnight}`;
}

/** Kapsama sekmesinden "yedek konum ver" → bu sekmede editörü o işletmeyle açar. */
export function useOpenLocationEditor() {
  const { rememberDealer } = useDiscoveryDraft();
  const url = useUrlState();
  return useCallback(
    (dealer: DealerRef) => {
      rememberDealer(dealer);
      url.set({ tab: 'konumlar', konum: dealer.id, page: null, filter: null, q: null });
    },
    [rememberDealer, url]
  );
}

/**
 * Yedek konumlar — YALNIZ bayi profilinde konumu olmayan işletmelerin Keşfet'te görünmesi için.
 * Profil konumu/saati varsa o kazanır; satır "kullanılmıyor" olarak işaretlenir (rapor Bulgu 3).
 * Koordinat ASLA uydurulmaz (eski "Bayilerden doldur" kaldırıldı — rapor Bulgu 2).
 */
export function LocationsTab() {
  const { draft, update, dealers } = useDiscoveryDraft();
  const url = useUrlState();
  const target = url.get('konum');
  const [editor, setEditor] = useState<{ open: boolean; index: number | null; dealerId: string }>({ open: false, index: null, dealerId: '' });

  useEffect(() => {
    if (!target) return;
    const index = draft.locations.findIndex((l) => l.dealerId === target);
    setEditor({ open: true, index: index >= 0 ? index : null, dealerId: target });
    url.set({ konum: null });
    // yalnız hedef değişince
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const rows = useMemo(() => draft.locations.map((l, index) => ({ ...l, index })), [draft.locations]);
  type Row = (typeof rows)[number];
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'dealer',
        header: 'İşletme',
        enableSorting: false,
        meta: { mobile: 'title', label: 'İşletme' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const d = dealers[row.original.dealerId];
          return (
            <div className="min-w-[12rem]">
              <span className={d ? 'block truncate font-medium text-fg' : 'block truncate font-medium text-danger'}>{d?.name ?? 'Bayi bulunamadı'}</span>
              <span className="block truncate text-xs text-fg-muted">{row.original.address ?? 'Adres yok'}</span>
            </div>
          );
        },
      },
      {
        id: 'coords',
        header: 'Konum',
        enableSorting: false,
        meta: { label: 'Konum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">
            {fmtDecimal(row.original.latitude)}, {fmtDecimal(row.original.longitude)}
          </span>
        ),
      },
      {
        id: 'hours',
        header: 'Saat',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Saat' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm">{hoursText(row.original)}</span>,
      },
      {
        id: 'categories',
        header: 'Kategoriler',
        enableSorting: false,
        meta: { label: 'Kategoriler' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm">{row.original.categories.join(', ') || '—'}</span>,
      },
    ],
    [dealers]
  );

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-fg-muted">
          Asıl kaynak bayi profilidir (Bayi ayarları ya da Kullanıcılar → profil). Yedek konum yalnız profilinde konum olmayan işletmeyi Keşfet’e taşır; yedek saat de yalnız profilde saat yoksa
          kullanılır. Saatler İstanbul saatidir; kapanış açılıştan küçükse ertesi güne taşar.
        </p>
        <Button className="min-h-11 shrink-0 sm:min-h-10" onClick={() => setEditor({ open: true, index: null, dealerId: '' })}>
          <Plus className="h-4 w-4" aria-hidden />
          Yedek konum ekle
        </Button>
      </div>
      <DataTable
        ariaLabel="Yedek konumlar"
        columns={columns}
        data={rows}
        getRowId={(r) => r.dealerId}
        onRowClick={(r) => setEditor({ open: true, index: r.index, dealerId: r.dealerId })}
        paginated
        defaultPageSize={20}
        empty={{
          variant: 'first-use',
          title: 'Yedek konum yok',
          description: 'Konumu profilde olmayan işletmeleri “Kapsama” sekmesinde “Konumu yok” süzgeciyle bulup buradan yedek konum verebilirsiniz.',
        }}
      />
      <LocationEditor
        open={editor.open}
        index={editor.index}
        presetDealerId={editor.dealerId}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        onDelete={(index) => {
          update((d) => ({ ...d, locations: d.locations.filter((_, i) => i !== index) }));
          setEditor((s) => ({ ...s, open: false }));
          toast.success('Yedek konum taslaktan kaldırıldı.');
        }}
      />
    </div>
  );
}

function LocationEditor({
  open,
  index,
  presetDealerId,
  onOpenChange,
  onDelete,
}: {
  open: boolean;
  index: number | null;
  presetDealerId: string;
  onOpenChange: (open: boolean) => void;
  onDelete: (index: number) => void;
}) {
  const { draft, update, dealers, rememberDealer } = useDiscoveryDraft();
  const id = useId();
  const current = index != null ? draft.locations[index] ?? null : null;
  const form = useZodForm<LocationForm>(locationFormSchema as unknown as z.ZodType<LocationForm>, { defaultValues: toForm(current, presetDealerId) });
  const { reset } = form;
  useEffect(() => {
    if (open) reset(toForm(current, presetDealerId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, presetDealerId]);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [customCat, setCustomCat] = useState('');
  const categories = useWatch({ control: form.control, name: 'categories' }) ?? [];
  const taken = useMemo(() => new Set(draft.locations.filter((_, i) => i !== index).map((l) => l.dealerId)), [draft.locations, index]);

  const applyPin = () => {
    const c = parseCoordinates(pin);
    if (!c) {
      setPinError('Koordinat çözülemedi. “41.0082, 28.9784” biçimini ya da Google Haritalar’ın tarayıcı adres çubuğundaki uzun bağlantıyı yapıştırın (kısa “maps.app.goo.gl” bağlantıları desteklenmez).');
      return;
    }
    setPinError(null);
    form.setValue('latitude', c.latitude, { shouldDirty: true, shouldValidate: true });
    form.setValue('longitude', c.longitude, { shouldDirty: true, shouldValidate: true });
    setPin('');
  };

  const catOptions = [...new Set([...SUGGESTED_CATEGORIES, ...categories])].map((c) => ({ value: c, label: c }));

  return (
    <EntityEditorSheet<LocationForm>
      open={open}
      onOpenChange={onOpenChange}
      mode={current ? 'edit' : 'create'}
      entityLabel="yedek konum"
      title={current ? 'Yedek konumu düzenle' : 'Yedek konum ekle'}
      description="Değişiklik taslağa uygulanır; müşteriye ulaşması için alttaki çubuktan yayınlayın."
      form={form}
      width="lg"
      submitLabel="Taslağa uygula"
      successToast={false}
      onSubmit={(v) => {
        const loc = discoveryLocationSchema.parse(toLocation(v));
        update((d) => {
          const list = [...d.locations];
          if (index != null && list[index]) list[index] = loc;
          else list.push(loc);
          return { ...d, locations: list };
        });
        toast.success('Yedek konum taslağa uygulandı.');
        return true;
      }}
      footerStart={
        current && index != null ? (
          <ConfirmAction
            tone="warning"
            title="Yedek konum kaldırılsın mı?"
            description="Bu işletmenin profilinde konum yoksa yayından sonra Keşfet’te görünmez."
            irreversibleNote={false}
            confirmLabel="Kaldır"
            trigger={
              <Button type="button" variant="ghost" className="min-h-11 text-danger">
                <Trash2 className="h-4 w-4" aria-hidden />
                Kaldır
              </Button>
            }
            onConfirm={() => onDelete(index)}
          />
        ) : null
      }
    >
      <div className="space-y-5">
        <Controller
          control={form.control}
          name="dealerId"
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-dealer`}>İşletme</Label>
              <DealerPicker
                id={`${id}-dealer`}
                value={field.value}
                dealer={dealers[field.value]}
                excludeIds={taken}
                invalid={!!fieldState.error}
                describedBy={fieldState.error ? `${id}-dealer-error` : undefined}
                onChange={(d) => {
                  if (d) rememberDealer(d);
                  field.onChange(d?.id ?? '');
                }}
              />
              {fieldState.error ? (
                <p id={`${id}-dealer-error`} role="alert" className="text-sm text-danger">
                  {fieldState.error.message}
                </p>
              ) : null}
            </div>
          )}
        />

        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium text-fg">Konum</legend>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-pin`}>Koordinat ya da Google Haritalar bağlantısı</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={`${id}-pin`}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyPin();
                  }
                }}
                placeholder="41.0082, 28.9784"
                className="min-h-11"
                aria-describedby={pinError ? `${id}-pin-error` : undefined}
              />
              <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={applyPin} disabled={!pin.trim()}>
                <Crosshair className="h-4 w-4" aria-hidden />
                Enlem/boylama aktar
              </Button>
            </div>
            {pinError ? (
              <p id={`${id}-pin-error`} role="alert" className="text-sm text-danger">
                {pinError}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField control={form.control} name="latitude" label="Enlem" mode="decimal" precision={6} min={-90} max={90} step={0} />
            <NumberField control={form.control} name="longitude" label="Boylam" mode="decimal" precision={6} min={-180} max={180} step={0} />
          </div>
          <TextField control={form.control} name="address" label="Adres" optional maxLength={200} description="Profilde adres varsa o gösterilir." />
        </fieldset>

        <div className="space-y-2">
          <Label id={`${id}-cats`}>Kategoriler</Label>
          <ChoiceChips
            mode="multiple"
            aria-labelledby={`${id}-cats`}
            options={catOptions}
            value={categories}
            max={MAX_CATEGORIES}
            onChange={(v) => form.setValue('categories', v, { shouldDirty: true, shouldValidate: true })}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Yeni kategori"
              value={customCat}
              maxLength={30}
              onChange={(e) => setCustomCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = customCat.trim().toLocaleLowerCase('tr-TR');
                  if (v.length >= 2 && !categories.includes(v) && categories.length < MAX_CATEGORIES) form.setValue('categories', [...categories, v], { shouldDirty: true });
                  setCustomCat('');
                }
              }}
              placeholder="Başka kategori yazıp Enter’a basın"
              className="min-h-11"
            />
          </div>
          <p className="text-xs text-fg-muted">Keşfet süzgeci “kahve”, “tatlı”, “yemek” anahtarlarını tanır; menü kategorileri de otomatik eklenir.</p>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium text-fg">Yedek çalışma saati (isteğe bağlı)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TimeInput control={form.control} name="opensAt" label="Açılış" />
            <TimeInput control={form.control} name="closesAt" label="Kapanış" />
          </div>
          <div className="space-y-1.5">
            <Label id={`${id}-days`}>Günler</Label>
            <Controller
              control={form.control}
              name="daysOfWeek"
              render={({ field, fieldState }) => (
                <>
                  <ChoiceChips
                    mode="multiple"
                    aria-labelledby={`${id}-days`}
                    options={WEEKDAYS.map((w) => ({ value: String(w.value), label: w.short, textLabel: w.long }))}
                    value={(field.value ?? []).map(String)}
                    onChange={(v) => field.onChange(v.map(Number))}
                  />
                  {fieldState.error ? (
                    <p role="alert" className="text-sm text-danger">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </>
              )}
            />
          </div>
          <ClosingNote control={form.control} />
        </fieldset>
        {form.formState.errors.root?.server?.message ? <InlineError variant="banner">{form.formState.errors.root.server.message}</InlineError> : null}
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <MapPinned className="h-4 w-4" aria-hidden />
          Profilinde konum olan işletmede bu satır kullanılmaz.
        </p>
      </div>
    </EntityEditorSheet>
  );
}

function TimeInput({ control, name, label }: { control: Control<LocationForm>; name: 'opensAt' | 'closesAt'; label: string }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            type="time"
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

function ClosingNote({ control }: { control: Control<LocationForm> }) {
  const [o, c] = useWatch({ control, name: ['opensAt', 'closesAt'] });
  if (!o || !c) return null;
  return <StatusBadge size="sm" tone="info" label={c <= o ? `Gece yarısını aşar: ${o} → ertesi gün ${c}` : `${o}–${c} (İstanbul saati)`} />;
}
