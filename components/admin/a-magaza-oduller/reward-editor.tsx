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
      entityLabel="ödül"
      title={base ? `“${base.name}” düzenle` : 'Yeni ödül'}
      description={
        base
          ? 'Yalnız değiştirdiğiniz alanlar kaydedilir; her değişiklik geçmişe yazılır.'
          : 'Yeni ödül taslak olarak başlar; “Yayında” açıkken kaydederseniz müşteri mağazasına hemen düşer.'
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
      successToast={base ? 'Ödül güncellendi' : 'Ödül oluşturuldu'}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-4">
          <TextField control={form.control} name="name" label="Ödül adı" required maxLength={50} placeholder="Örn: Bir fincan filtre kahve" />
          <TextareaField control={form.control} name="description" label="Açıklama" required maxLength={200} showCount="always" description="Müşteri ödül kartında görür." />
          <IconField control={form.control} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField control={form.control} name="type" label="Tür" options={REWARD_TYPES.map((t) => ({ value: t, label: REWARD_TYPE_LABEL[t] }))} />
            <NumberField control={form.control} name="cost" label="Puan maliyeti" min={1} max={1_000_000} unit="puan" required />
          </div>
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">{REWARD_TYPE_HINT[type]}</p>
          {base ? (
            <p className="text-sm text-fg-muted">
              Stok: <strong className="text-fg">{stockLabel(base.stock).label}</strong> — talepleri ezmemek için stok, ayrıntıdaki “Stok” bölümünden
              göreli olarak değişir{base.pool.enabled ? ' (kod havuzu açık: stok = havuzdaki kod sayısı)' : ''}.
            </p>
          ) : (
            <NumberField
              control={form.control}
              name="stock"
              label="Başlangıç stoğu"
              min={-1}
              max={1_000_000}
              description="-1 = sınırsız. Partner kodu yükleyecekseniz 0 bırakıp ayrıntıdan kod havuzunu açın."
            />
          )}

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-fg">Kurallar (isteğe bağlı)</legend>
            <NumberField control={form.control} name="perUserLimit" label="Kişi başı en fazla" min={1} max={1000} optional description="Boş = sınırsız." />
            <div className="grid gap-4 sm:grid-cols-2">
              <DateTimeField control={form.control} name="validFrom" label="Başlangıç (İstanbul saati)" />
              <DateTimeField control={form.control} name="validUntil" label="Bitiş (İstanbul saati)" />
            </div>
          </fieldset>

          <SwitchField
            control={form.control}
            name="isActive"
            label="Yayında"
            variant="card"
            description="Kapalıyken taslaktır: müşteri görmez ve alamaz. Alınmış ödüller etkilenmez."
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <Controller
      control={control}
      name="icon"
      render={({ field }) => (
        <div className="space-y-2">
          <TextField control={control} name="icon" label="İkon" required description="Emoji ya da yüklenen görsel (PNG/SVG, en fazla 2 MB)." />
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Hızlı emoji">
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={`İkon ${e}`}
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
                  toast.success('Görsel yüklendi');
                } catch (e) {
                  toast.error(errorText(e, 'Görsel yüklenemedi.'));
                } finally {
                  setUploading(false);
                }
              }}
            />
            <Button type="button" variant="outline" className="min-h-11" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
              {uploading ? 'Yükleniyor…' : 'Görsel yükle'}
            </Button>
          </div>
        </div>
      )}
    />
  );
}

function PreviewCard({ control }: { control: Control<RewardUpsertValues> }) {
  const [name, description, icon, cost, stock, type] = useWatch({ control, name: ['name', 'description', 'icon', 'cost', 'stock', 'type'] });
  const s = stockLabel(Number(stock));
  return (
    <aside aria-label="Önizleme" className="order-first lg:order-none">
      <div className="sticky top-2 flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-1 p-4 text-center">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">Müşteri kartı</span>
        <RewardIcon icon={icon} name={name || 'Ödül'} size="lg" />
        <span className="line-clamp-2 font-semibold text-fg">{name || 'Ödül adı'}</span>
        <span className="line-clamp-3 text-xs text-fg-muted">{description || 'Açıklama'}</span>
        <span className="rounded-full bg-brand-subtle px-3 py-1 text-sm font-semibold tabular-nums text-brand">{fmtNumber(Number(cost) || 0)} puan</span>
        <StatusBadge size="sm" icon={null} tone={s.tone} label={`${REWARD_TYPE_LABEL[type]} · ${s.label}`} />
      </div>
    </aside>
  );
}
