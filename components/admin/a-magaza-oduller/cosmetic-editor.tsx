'use client';

import { useEffect, useRef, useState } from 'react';
import { Controller, useWatch, type Control, type UseFormReturn } from 'react-hook-form';
import { ImagePlus, Loader2, Lock, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EntityEditorSheet, NumberField, SelectField, SwitchField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import { RarityBadge } from '@/components/ds/play';
import { CosmeticPreview } from '@/components/customer/m-cuzdan-oduller/cosmetic-preview';
import { cn } from '@/lib/utils';
import {
  BADGE_PRESETS,
  COSMETIC_RARITIES,
  COSMETIC_RARITY_LABEL,
  COSMETIC_TYPE_LABEL,
  COSMETIC_TYPES,
  FRAME_EFFECTS,
  cosmeticUpsertSchema,
  isImageSrc,
  slugify,
  type CosmeticListItem,
  type CosmeticUpsertValues,
} from '@/lib/admin-store/contract';
import { changedFields, createCosmetic, errorText, fetchCosmetic, updateCosmetic, uploadStoreImage } from './api';
import { ADMIN_PREVIEW_USER } from './cosmetics-tab';
import { fmtNumber } from './format';
import { STORE_DICT, useStoreCopy } from './copy';
import { useSourceT } from '@/components/ds/page/source-dict';

const EMPTY: CosmeticUpsertValues = {
  name: '',
  slug: null,
  description: null,
  type: 'avatar_frame',
  price: 1000,
  asset: 'fire_effect',
  rarity: 'common',
  isActive: false,
};

function toValues(c: CosmeticListItem): CosmeticUpsertValues {
  return {
    name: c.name,
    slug: c.slug,
    description: c.description,
    type: c.type === 'other' ? 'avatar_frame' : c.type,
    price: c.price,
    asset: c.asset ?? '',
    rarity: c.rarity,
    isActive: c.isActive,
  };
}

export type CosmeticEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CosmeticListItem | null;
  onSaved: (id: string) => void;
};

/**
 * Kozmetik düzenleyici: türe göre GÖRÜNÜM seçici (çerçeve efekt galerisi / rozet hazır + görsel /
 * arka plan görseli) — serbest "Görsel URL" alanı kalktı; sağda müşteri bileşeninin kendisiyle canlı
 * önizleme (Bulgu 3/12). Sahibi olan ürünün türü kilitli (Bulgu 9).
 */
export function CosmeticEditor({ open, onOpenChange, item, onSaved }: CosmeticEditorProps) {
  const fx = useStoreCopy().fx;
  const L = useSourceT(STORE_DICT);
  const ux = useStoreCopy().ui;
  const [base, setBase] = useState<CosmeticListItem | null>(item);
  const form = useZodForm<CosmeticUpsertValues>(cosmeticUpsertSchema, { defaultValues: item ? toValues(item) : EMPTY });
  const { reset } = form;
  useEffect(() => {
    if (open) {
      setBase(item);
      reset(item ? toValues(item) : EMPTY);
    }
  }, [open, item, reset]);
  const typeLocked = !!base && base.owners > 0;

  return (
    <EntityEditorSheet<CosmeticUpsertValues>
      open={open}
      onOpenChange={onOpenChange}
      mode={base ? 'edit' : 'create'}
      entityLabel={ux.urun}
      title={base ? fx.editTitle(base.name) : ux.yeniKozmetikUrun}
      description={
        base && base.owners > 0
          ? fx.ownersNote(fmtNumber(base.owners))
          : ux.yeniUrunSatistaDegil
      }
      form={form}
      width="xl"
      onSubmit={async (v) => {
        if (base) {
          const before = toValues(base);
          const changes = changedFields(before as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>);
          const saved = await updateCosmetic(base.id, before as unknown as Record<string, unknown>, changes);
          return saved.id;
        }
        const created = await createCosmetic(v);
        return created.id;
      }}
      onSaved={(id) => onSaved(String(id))}
      onReloadLatest={
        base
          ? async () => {
              try {
                const fresh = await fetchCosmetic(base.id);
                setBase(fresh.item);
                reset(toValues(fresh.item));
              } catch (e) {
                toast.error(errorText(e));
              }
            }
          : undefined
      }
      successToast={base ? ux.urunGuncellendi : ux.urunOlusturuldu}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <TextField control={form.control} name="name" label={ux.urunAdi} required maxLength={200} />
          <SlugField form={form} />
          <TextareaField control={form.control} name="description" label={ux.aciklama} optional maxLength={2000} rows={3} emptyAsNull />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="type"
              label={ux.tur}
              disabled={typeLocked}
              labelAside={typeLocked ? <Lock className="h-3.5 w-3.5 text-fg-muted" aria-label={ux.kilitli} /> : undefined}
              description={typeLocked ? ux.sahibiOlanUrununTuru : undefined}
              options={COSMETIC_TYPES.map((t) => ({ value: t, label: L(COSMETIC_TYPE_LABEL[t]) }))}
            />
            <NumberField control={form.control} name="price" label={ux.fiyat} min={0} max={10_000_000} unit="puan" required description={ux.puanBakiyesindenDuserXp} />
          </div>
          <AssetPicker control={form.control} setAsset={(v) => form.setValue('asset', v, { shouldDirty: true, shouldValidate: true })} />
          <RarityPicker control={form.control} />
          <SwitchField
            control={form.control}
            name="isActive"
            label={ux.satista}
            variant="card"
            description={ux.kapaliUrunSatinAlinamaz}
          />
        </div>
        <Preview control={form.control} />
      </div>
    </EntityEditorSheet>
  );
}

function SlugField({ form }: { form: UseFormReturn<CosmeticUpsertValues> }) {
  const ux = useStoreCopy().ui;
  return (
    <TextField
      control={form.control}
      name="slug"
      label={ux.kisaAdSlug}
      optional
      emptyAsNull
      maxLength={80}
      description={ux.yalnizKucukHarfRakam}
      endAdornment={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 sm:min-h-8"
          onClick={() => form.setValue('slug', slugify(form.getValues('name')) || null, { shouldDirty: true, shouldValidate: true })}
        >
          <Wand2 className="h-4 w-4" aria-hidden />
          {ux.addanUret}
        </Button>
      }
    />
  );
}

function AssetPicker({ control, setAsset }: { control: Control<CosmeticUpsertValues>; setAsset: (v: string) => void }) {
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  const type = useWatch({ control, name: 'type' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const presets = type === 'avatar_frame' ? FRAME_EFFECTS : type === 'profile_badge' ? BADGE_PRESETS : [];
  const allowUpload = type !== 'avatar_frame';

  return (
    <Controller
      control={control}
      name="asset"
      render={({ field, fieldState }) => (
        <fieldset className="space-y-2" aria-describedby={fieldState.error ? 'asset-err' : undefined}>
          <legend className="text-sm font-medium text-fg">{sx.appearance}</legend>
          {presets.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={ux.hazirGorunumler}>
              {presets.map((p) => {
                const selected = field.value === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAsset(p.id)}
                    className={cn(
                      'group flex min-h-11 flex-col items-center gap-2 rounded-control border p-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      selected ? 'border-brand bg-brand-subtle text-fg' : 'border-subtle bg-surface-1 text-fg-muted hover:bg-surface-2'
                    )}
                  >
                    <span className="relative block h-12 w-12 overflow-hidden" aria-hidden>
                      <span className="absolute left-0 top-0 block origin-top-left scale-50">
                        <CosmeticPreview item={{ type, asset: p.id, name: p.label }} preview={ADMIN_PREVIEW_USER} />
                      </span>
                    </span>
                    {p.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {allowUpload ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={async (ev) => {
                  const file = ev.target.files?.[0];
                  ev.target.value = '';
                  if (!file) return;
                  setUploading(true);
                  try {
                    setAsset(await uploadStoreImage(file, 'cosmetics'));
                    toast.success(ux.gorselYuklendi);
                  } catch (e) {
                    toast.error(errorText(e, ux.gorselYuklenemedi));
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <Button type="button" variant="outline" className="min-h-11" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
                {uploading ? ux.yukleniyor : type === 'profile_background' ? ux.arkaPlanGorseliYukle : ux.ozelRozetGorseliYukle}
              </Button>
              {isImageSrc(field.value) ? <span className="truncate text-xs text-fg-muted">{sx.uploadedImage}</span> : null}
            </div>
          ) : null}
          <p className="text-xs text-fg-muted">
            {type === 'avatar_frame'
              ? ux.cercevelerMusterideEfektOlarak
              : type === 'profile_badge'
                ? ux.hazirRozetlerdenBiriniSecin
                : ux.arkaPlanProfilKartinin}
          </p>
          {fieldState.error ? (
            <p id="asset-err" className="text-xs text-danger">
              {fieldState.error.message}
            </p>
          ) : null}
        </fieldset>
      )}
    />
  );
}

function RarityPicker({ control }: { control: Control<CosmeticUpsertValues> }) {
  const L = useSourceT(STORE_DICT);
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  return (
    <Controller
      control={control}
      name="rarity"
      render={({ field }) => (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">Nadirlik</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ux.nadirlik}>
            {COSMETIC_RARITIES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={field.value === r}
                onClick={() => field.onChange(r)}
                className={cn(
                  'min-h-11 rounded-control border px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  field.value === r ? 'border-brand bg-brand-subtle' : 'border-subtle bg-surface-1 hover:bg-surface-2'
                )}
              >
                <RarityBadge rarity={r} />
                <span className="sr-only">{L(COSMETIC_RARITY_LABEL[r])}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-fg-muted">{sx.legendaryHint}</p>
        </fieldset>
      )}
    />
  );
}

function Preview({ control }: { control: Control<CosmeticUpsertValues> }) {
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  const [name, type, asset, rarity, price] = useWatch({ control, name: ['name', 'type', 'asset', 'rarity', 'price'] });
  return (
    <aside aria-label={ux.musteriOnizlemesi} className="order-first lg:order-none">
      <div className="group sticky top-2 flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-1 p-4 text-center" tabIndex={0}>
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">{sx.storefront}</span>
        <CosmeticPreview item={{ type, asset: asset || null, name: name || ux.urun2 }} preview={ADMIN_PREVIEW_USER} size="lg" />
        <span className="line-clamp-2 font-semibold text-fg">{name || ux.urunAdi}</span>
        <RarityBadge rarity={rarity} />
        <span className="rounded-full bg-brand-subtle px-3 py-1 text-sm font-semibold tabular-nums text-brand">
          {Number(price) > 0 ? `${fmtNumber(Number(price))} puan` : ux.ucretsiz}
        </span>
        <span className="text-xs text-fg-muted">{sx.effectsHint}</span>
      </div>
    </aside>
  );
}
