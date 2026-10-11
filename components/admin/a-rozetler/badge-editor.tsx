'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { ImagePlus, Loader2, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EntityEditorSheet, NumberField, SelectField, SwitchField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import { BadgeGlyph, RarityBadge } from '@/components/ds/play';
import { InlineError } from '@/components/states';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { REQUIREMENT_TYPE_OPTIONS, trackabilityOf } from '@/lib/badge-trackability';
import {
  BADGE_CATEGORIES,
  BADGE_RARITIES,
  RARITY_LABEL,
  TRACKABILITY_LABEL,
  badgeUpsertSchema,
  characterBadgePatchSchema,
  type BadgeDetail,
  type BadgeUpsertValues,
} from '@/lib/admin-badges/contract';
import { cn } from '@/lib/utils';
import { createBadge, errorText, updateBadge, uploadBadgeIcon } from './api';
import { glyphSource } from './parts';
import { resolveBadgeThumb } from '@/lib/badge-images';
import { useSourceT } from '@/components/ds/page/source-dict';
import { BADGES_DICT, useBadgesAdminCopy } from './copy';

/** İkon galerisi tek kaynaktan: rozet kataloğu (ikinci elle yazılmış liste yok — Bulgu 11). */
const ICON_GALLERY = Array.from(new Map(BADGE_CATALOG.map((b) => [b.icon, b.name])).entries()).map(([icon, name]) => ({ icon, name }));

const EMPTY: BadgeUpsertValues = {
  name: '',
  description: '',
  icon: '',
  category: 'general',
  rarity: 'common',
  requirementType: 'feedback_count',
  targetValue: 10,
  isActive: true,
  color: null,
  bgColor: null,
};

function toValues(b: BadgeDetail): BadgeUpsertValues {
  return {
    name: b.name,
    description: b.description ?? '',
    icon: b.icon,
    category: (BADGE_CATEGORIES.some((c) => c.value === b.category) ? b.category : 'general') as BadgeUpsertValues['category'],
    rarity: b.rarity,
    // Karakterde koşul motorda; formda görünmez (şema da göndermez).
    requirementType: REQUIREMENT_TYPE_OPTIONS.some((o) => o.value === b.requirementType) ? b.requirementType : 'feedback_count',
    targetValue: Math.max(1, b.targetValue || 1),
    isActive: b.status === 'active',
    color: b.color,
    bgColor: b.bgColor,
  };
}

export type BadgeEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → yeni rozet. */
  badge: BadgeDetail | null;
  onSaved: (id: string) => void;
};

export function BadgeEditor({ open, onOpenChange, badge, onSaved }: BadgeEditorProps) {
  const fz = useBadgesAdminCopy().fx;
  const L = useSourceT(BADGES_DICT);
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const isCharacter = badge?.isCharacter === true;
  const form = useZodForm<BadgeUpsertValues>(
    (isCharacter ? characterBadgePatchSchema : badgeUpsertSchema) as unknown as typeof badgeUpsertSchema,
    { defaultValues: badge ? toValues(badge) : EMPTY }
  );
  // Her açılışta formu o kayıtla (ya da boş) sıfırla: önceki düzenleme "yeni"ye sızmaz (Bulgu 6).
  const { reset } = form;
  useEffect(() => {
    if (open) reset(badge ? toValues(badge) : EMPTY);
  }, [open, badge, reset]);

  const reqType = useWatch({ control: form.control, name: 'requirementType' });
  const reqOption = REQUIREMENT_TYPE_OPTIONS.find((o) => o.value === reqType);

  return (
    <EntityEditorSheet<BadgeUpsertValues>
      open={open}
      onOpenChange={onOpenChange}
      mode={badge ? 'edit' : 'create'}
      entityLabel="rozet"
      title={badge ? fz.editTitle(badge.name) : fz.newBadge}
      description={
        isCharacter
          ? ux.karakterRozetiKazanmaKosulu
          : ux.kaydedilenHerDegisiklikDenetim
      }
      form={form}
      width="lg"
      onSubmit={async (v) => {
        if (badge) {
          const saved = await updateBadge(badge.id, v);
          return saved.id;
        }
        const created = await createBadge(v);
        return created.id;
      }}
      onSaved={(id) => onSaved(String(id))}
      successToast={badge ? ux.rozetGuncellendi : ux.rozetOlusturuldu}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-4">
          <TextField control={form.control} name="name" label={ux.rozetAdi} required maxLength={60} />
          <TextareaField control={form.control} name="description" label={ux.aciklama} optional description={ux.musteriRozetiKazandigindaGorur} />
          <IconPicker control={form.control} />
          <div className="grid gap-4 sm:grid-cols-2">
            {!isCharacter && (
              <SelectField
                control={form.control}
                name="category"
                label={ux.kategori}
                options={BADGE_CATEGORIES.filter((c) => c.value !== 'dizi').map((c) => ({ value: c.value, label: L(c.label) }))}
              />
            )}
            <SelectField
              control={form.control}
              name="rarity"
              label={ux.nadirlik}
              options={BADGE_RARITIES.map((r) => ({ value: r, label: L(RARITY_LABEL[r]) }))}
            />
          </div>

          {!isCharacter && (
            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium text-fg">{bx.earnCondition}</legend>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <SelectField
                  control={form.control}
                  name="requirementType"
                  label={ux.sayac}
                  options={REQUIREMENT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
                <NumberField control={form.control} name="targetValue" label={ux.hedef} min={1} max={1_000_000} />
              </div>
              {reqOption ? (
                <p className="text-xs text-fg-muted">
                  <span className={cn('font-medium', trackabilityOf(reqOption.value) === 'exact' ? 'text-success' : 'text-warning')}>
                    {L(TRACKABILITY_LABEL[trackabilityOf(reqOption.value)])}
                  </span>
                  {' · '}
                  {reqOption.hint}
                </p>
              ) : null}
            </fieldset>
          )}

          <ColorFields
            control={form.control}
            onReset={() => {
              form.setValue('color', null, { shouldDirty: true });
              form.setValue('bgColor', null, { shouldDirty: true });
            }}
          />

          <SwitchField
            control={form.control}
            name="isActive"
            label={ux.etkin}
            variant="card"
            description={
              isCharacter
                ? ux.kapaliykenBuKarakterYeni
                : ux.kapaliykenKimseYeniKazanamaz
            }
          />
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">
            {bx.visibilityA} <strong className="text-fg">{bx.visibilityStrong}</strong> {bx.visibilityB}
          </p>
        </div>
        <PreviewCard control={form.control} />
      </div>
    </EntityEditorSheet>
  );
}

function PreviewCard({ control }: { control: Control<BadgeUpsertValues> }) {
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const [name, icon, rarity, color] = useWatch({ control, name: ['name', 'icon', 'rarity', 'color'] });
  return (
    <aside aria-label={ux.onizleme} className="order-first lg:order-none">
      <div className="sticky top-2 flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-1 p-4 text-center">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">{bx.customerView}</span>
        <BadgeGlyph label={name || 'Rozet'} {...glyphSource(icon)} rarity={rarity} color={color ?? undefined} size="xl" register="play" />
        <span className="line-clamp-2 font-semibold text-fg">{name || ux.rozetAdi}</span>
        <RarityBadge rarity={rarity} />
      </div>
    </aside>
  );
}

function IconPicker({ control }: { control: Control<BadgeUpsertValues> }) {
  const fz = useBadgesAdminCopy().fx;
  const uy = useBadgesAdminCopy().ui2;
  const ux = useBadgesAdminCopy().ui;
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('tr-TR');
    return n ? ICON_GALLERY.filter((i) => i.name.toLocaleLowerCase('tr-TR').includes(n)) : ICON_GALLERY;
  }, [q]);

  return (
    <Controller
      control={control}
      name="icon"
      render={({ field, fieldState }) => (
        <fieldset className="space-y-2" aria-describedby={fieldState.error ? `${id}-err` : undefined}>
          <legend className="text-sm font-medium text-fg">
            {fz.icon} <span className="text-danger">*</span>
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
              <Input
                id={`${id}-q`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={ux.galerideAra}
                aria-label={ux.ikonGalerisindeAra}
                className="min-h-11 pl-8 sm:min-h-10"
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/svg+xml,image/png"
              className="sr-only"
              aria-label={ux.svgYaDaPng}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setBusy(true);
                setError(null);
                try {
                  field.onChange(await uploadBadgeIcon(f));
                } catch (err) {
                  setError(errorText(err, ux.ikonYuklenemedi));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
              {busy ? ux.yukleniyor : ux.dosyaYukle}
            </Button>
          </div>
          <div role="listbox" aria-label={ux.ikonGalerisi} className="grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-8">
            {list.map((i) => {
              const selected = field.value === i.icon;
              return (
                <button
                  key={i.icon}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  title={i.name}
                  onClick={() => field.onChange(i.icon)}
                  className={cn(
                    'flex aspect-square min-h-11 items-center justify-center rounded-md border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'border-brand bg-brand-subtle' : 'border-transparent hover:bg-surface-2'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- yerel rozet SVG'leri; next/image gerekmez */}
                  <img src={resolveBadgeThumb(i.icon) ?? i.icon} alt={i.name} className="h-full w-full object-contain" loading="lazy" />
                </button>
              );
            })}
            {list.length === 0 ? <p className="col-span-full py-4 text-center text-sm text-fg-muted">{uy.buAramayaUyanIkon}</p> : null}
          </div>
          <p className="truncate text-xs text-fg-muted">
            {fz.selected} <span className="font-mono">{field.value || '—'}</span>
          </p>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          {fieldState.error ? (
            <p id={`${id}-err`} role="alert" className="text-sm text-danger">
              {fieldState.error.message}
            </p>
          ) : null}
        </fieldset>
      )}
    />
  );
}

function ColorRow({ control, name, label, hint }: { control: Control<BadgeUpsertValues>; name: 'color' | 'bgColor'; label: string; hint: string }) {
  const fz = useBadgesAdminCopy().fx;
  const ux = useBadgesAdminCopy().ui;
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-hex`}>{label}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={fz.pickerOf(label)}
              value={field.value ?? '#7c3aed'}
              onChange={(e) => field.onChange(e.target.value)}
              className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1 sm:h-10 sm:w-10"
            />
            <Input
              id={`${id}-hex`}
              value={field.value ?? ''}
              placeholder={ux.nadirlikRengi}
              onChange={(e) => field.onChange(e.target.value.trim() || null)}
              onBlur={field.onBlur}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={`${id}-hint`}
              className="min-h-11 font-mono sm:min-h-10"
              maxLength={7}
            />
          </div>
          <p id={`${id}-hint`} className={cn('text-xs', fieldState.error ? 'text-danger' : 'text-fg-muted')} role={fieldState.error ? 'alert' : undefined}>
            {fieldState.error?.message ?? hint}
          </p>
        </div>
      )}
    />
  );
}

function ColorFields({ control, onReset }: { control: Control<BadgeUpsertValues>; onReset: () => void }) {
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const [color, bgColor] = useWatch({ control, name: ['color', 'bgColor'] });
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium text-fg">{bx.appearance}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorRow control={control} name="color" label={ux.vurguRengi} hint={ux.bosBirakilirsaNadirlikRengi} />
        <ColorRow control={control} name="bgColor" label={ux.arkaPlanRengi} hint={ux.yalnizVurguRengiyleBirlikte} />
      </div>
      {bgColor && !color ? (
        <p role="status" className="text-xs text-warning">
          {ux.arkaPlanRengiVurgu}
        </p>
      ) : null}
      {color || bgColor ? (
        <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={onReset}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          {ux.nadirlikRengineDon}
        </Button>
      ) : null}
    </fieldset>
  );
}
