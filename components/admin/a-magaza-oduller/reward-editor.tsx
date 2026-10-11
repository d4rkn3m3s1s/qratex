'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ds/data';
import { EntityEditorSheet, NumberField, SelectField, SwitchField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import {
  REWARD_TYPE_HINT,
  REWARD_TYPE_LABEL,
  REWARD_TYPES,
  rewardUpsertSchema,
  type RewardListItem,
  type RewardUpsertValues,
} from '@/lib/admin-store/contract';
import { changedFields, createReward, errorText, fetchReward, updateReward, uploadStoreImage } from './api';
import { fmtNumber, stockLabel } from './format';
import { RewardIcon } from './parts';
import { STORE_DICT, useStoreCopy } from './copy';
import { useSourceT } from '@/components/ds/page/source-dict';

const EMPTY: RewardUpsertValues = {
  name: '',
  description: '',
  icon: '🎁',
  cost: 500,
  stock: -1,
  type: 'digital',
  isActive: false,
  perUserLimit: null,
  validFrom: null,
  validUntil: null,
};

const QUICK_EMOJI = ['🎁', '☕', '🍰', '🎟️', '🛍️', '🏷️', '🎧', '⭐'];

function toValues(r: RewardListItem): RewardUpsertValues {
  return {
    name: r.name,
    description: r.description,
    icon: r.icon || '🎁',
    cost: Math.max(1, r.cost),
    stock: r.stock,
    type: r.type,
    isActive: r.isActive,
    perUserLimit: r.rules.perUserLimit,
    validFrom: r.rules.validFrom,
    validUntil: r.rules.validUntil,
  };
}

/** İstanbul (UTC+3, yaz saati yok) yerel tarih-saat ↔ ISO. */
const IST_OFFSET_MS = 3 * 3_600_000;
export function isoToIstanbulLocal(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 16);
}
export function istanbulLocalToIso(local: string): string | null {
  if (!local) return null;
  const t = Date.parse(`${local}:00+03:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export type RewardEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → yeni ödül. */
  reward: RewardListItem | null;
  onSaved: (id: string) => void;
};

/**
 * Ödül düzenleyici — modül seviyesinde bileşen (D2/P0-39: render içinde bileşen yok, odak kaybı yok),
 * her açılışta form o kayıtla ya da boşla sıfırlanır (B4), alan hataları alanlarda (B8), düzenlemede
 * yalnız değişen alanlar + iyimser kilit gider (B6). Stok burada değil, ayrıntıdaki stok hareketiyle değişir.
 */
export function RewardEditor({ open, onOpenChange, reward, onSaved }: RewardEditorProps) {
  const fx = useStoreCopy().fx;
  const L = useSourceT(STORE_DICT);
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  const [base, setBase] = useState<RewardListItem | null>(reward);
  const form = useZodForm<RewardUpsertValues>(rewardUpsertSchema, { defaultValues: reward ? toValues(reward) : EMPTY });
  const { reset } = form;
  useEffect(() => {
    if (open) {
      setBase(reward);
      reset(reward ? toValues(reward) : EMPTY);
    }
  }, [open, reward, reset]);
  const type = useWatch({ control: form.control, name: 'type' });

  return (
    <EntityEditorSheet<RewardUpsertValues>
      open={open}
      onOpenChange={onOpenChange}
      mode={base ? 'edit' : 'create'}
      entityLabel={ux.odul2}
      title={base ? fx.editTitle(base.name) : ux.yeniOdul}
      description={
        base
          ? ux.yalnizDegistirdiginizAlanlarKaydedilir
          : ux.yeniOdulTaslakOlarak
      }
      form={form}
      width="lg"
      onSubmit={async (v) => {
        if (base) {
          const before = toValues(base);
          const changes = changedFields(before as unknown as Record<string, unknown>, v as unknown as Record<string, unknown>);
          delete (changes as Record<string, unknown>).stock;
          const saved = await updateReward(base.id, base.updatedAt, changes);
          return saved.id;
        }
        const created = await createReward(v);
        return created.id;
      }}
      onSaved={(id) => onSaved(String(id))}
      onReloadLatest={
        base
          ? async () => {
              try {
                const fresh = await fetchReward(base.id);
                setBase(fresh.item);
                reset(toValues(fresh.item));
              } catch (e) {
                toast.error(errorText(e));
              }
            }
          : undefined
      }
      successToast={base ? ux.odulGuncellendi : ux.odulOlusturuldu}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-4">
          <TextField control={form.control} name="name" label={ux.odulAdi} required maxLength={50} placeholder={ux.ornBirFincanFiltre} />
          <TextareaField control={form.control} name="description" label={ux.aciklama} required maxLength={200} showCount="always" description={ux.musteriOdulKartindaGorur} />
          <IconField control={form.control} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField control={form.control} name="type" label={ux.tur} options={REWARD_TYPES.map((t) => ({ value: t, label: L(REWARD_TYPE_LABEL[t]) }))} />
            <NumberField control={form.control} name="cost" label={ux.puanMaliyeti} min={1} max={1_000_000} unit="puan" required />
          </div>
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">{L(REWARD_TYPE_HINT[type])}</p>
          {base ? (
            <p className="text-sm text-fg-muted">
              {fx.stockNow} <strong className="text-fg">{L(stockLabel(base.stock).label)}</strong> {ux.talepleriEzmemekIcinStok}
              {fx.relativeChange}{base.pool.enabled ? ux.kodHavuzuAcikStok : ''}.
            </p>
          ) : (
            <NumberField
              control={form.control}
              name="stock"
              label={ux.baslangicStogu}
              min={-1}
              max={1_000_000}
              description={ux.t1SinirsizPartnerKodu}
            />
          )}

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-fg">{sx.rulesOptional}</legend>
            <NumberField control={form.control} name="perUserLimit" label={ux.kisiBasiEnFazla} min={1} max={1000} optional description={ux.bosSinirsiz} />
            <div className="grid gap-4 sm:grid-cols-2">
              <DateTimeField control={form.control} name="validFrom" label={ux.baslangicIstanbulSaati} />
              <DateTimeField control={form.control} name="validUntil" label={ux.bitisIstanbulSaati} />
            </div>
          </fieldset>

          <SwitchField
            control={form.control}
            name="isActive"
            label={ux.yayinda}
            variant="card"
            description={ux.kapaliykenTaslaktirMusteriGormez}
          />
        </div>
        <PreviewCard control={form.control} />
      </div>
    </EntityEditorSheet>
  );
}

function DateTimeField({ control, name, label }: { control: Control<RewardUpsertValues>; name: 'validFrom' | 'validUntil'; label: string }) {
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
            type="datetime-local"
            className="min-h-11"
            value={isoToIstanbulLocal(field.value)}
            onChange={(e) => field.onChange(istanbulLocalToIso(e.target.value))}
            onBlur={field.onBlur}
            aria-invalid={fieldState.error ? true : undefined}
            aria-describedby={fieldState.error ? `${id}-err` : undefined}
          />
          {fieldState.error ? (
            <p id={`${id}-err`} className="text-xs text-danger">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

function IconField({ control }: { control: Control<RewardUpsertValues> }) {
  const fx = useStoreCopy().fx;
  const ux = useStoreCopy().ui;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <Controller
      control={control}
      name="icon"
      render={({ field }) => (
        <div className="space-y-2">
          <TextField control={control} name="icon" label={ux.ikon} required description={ux.emojiYaDaYuklenen} />
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ux.hizliEmoji}>
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={fx.iconAria(e)}
                aria-pressed={field.value === e}
                onClick={() => field.onChange(e)}
                className="grid size-11 place-items-center rounded-control border border-subtle bg-surface-1 text-xl transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus aria-pressed:border-brand aria-pressed:bg-brand-subtle"
              >
                {e}
              </button>
            ))}
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
                  field.onChange(await uploadStoreImage(file, 'rewards'));
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
              {uploading ? ux.yukleniyor : ux.gorselYukle}
            </Button>
          </div>
        </div>
      )}
    />
  );
}

function PreviewCard({ control }: { control: Control<RewardUpsertValues> }) {
  const L = useSourceT(STORE_DICT);
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  const [name, description, icon, cost, stock, type] = useWatch({ control, name: ['name', 'description', 'icon', 'cost', 'stock', 'type'] });
  const s = stockLabel(Number(stock));
  return (
    <aside aria-label={ux.onizleme} className="order-first lg:order-none">
      <div className="sticky top-2 flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-1 p-4 text-center">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">{sx.customerCard}</span>
        <RewardIcon icon={icon} name={name || ux.odul} size="lg" />
        <span className="line-clamp-2 font-semibold text-fg">{name || ux.odulAdi}</span>
        <span className="line-clamp-3 text-xs text-fg-muted">{description || ux.aciklama}</span>
        <span className="rounded-full bg-brand-subtle px-3 py-1 text-sm font-semibold tabular-nums text-brand">{fmtNumber(Number(cost) || 0)} puan</span>
        <StatusBadge size="sm" icon={null} tone={s.tone} label={`${L(REWARD_TYPE_LABEL[type])} · ${L(s.label)}`} />
      </div>
    </aside>
  );
}
