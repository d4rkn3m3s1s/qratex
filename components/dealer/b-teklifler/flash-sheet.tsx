'use client';

import { useEffect, useMemo } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { BadgePercent, Gift, MapPinOff } from 'lucide-react';
import { EntityEditorSheet, Field, NumberField, TextField, TextareaField, useZodForm, errorMessageOf } from '@/components/ds/form';
import { ChoiceChips } from '@/components/ds/a11y';
import { Input } from '@/components/ui/input';
import {
  FLASH_BODY_MAX,
  FLASH_DURATIONS,
  FLASH_MAX_SCHEDULE_DAYS,
  FLASH_OFFER_TYPES,
  FLASH_TITLE_MAX,
  FLASH_VALUE_LIMITS,
  flashCreateSchema,
  flashValueLabel,
  utcToIstanbulWall,
  type FlashCreateInput,
  type FlashOfferType,
} from '@/lib/dealer/offers/rules';
import { createFlash } from './api';
import { useOffersCopy, useOffersLocale } from './context';

const DEFAULTS: FlashCreateInput = {
  title: '',
  body: '',
  offerType: 'PERCENT',
  value: 15,
  durationMinutes: 30,
  startMode: 'now',
  startAt: null,
};

export function FlashSheet({
  open,
  onOpenChange,
  hasLocation,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasLocation: boolean;
  onCreated: () => void;
}) {
  const copy = useOffersCopy();
  const locale = useOffersLocale();
  const form = useZodForm(flashCreateSchema, { defaultValues: DEFAULTS });
  const values = useWatch({ control: form.control }) as Partial<FlashCreateInput>;
  const offerType = (values.offerType ?? 'PERCENT') as FlashOfferType;

  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  // datetime-local sınırları İstanbul duvar saatiyle (sunucu ayrıca doğrular).
  const bounds = useMemo(() => {
    const now = new Date();
    return {
      min: utcToIstanbulWall(new Date(now.getTime() + 5 * 60_000)),
      max: utcToIstanbulWall(new Date(now.getTime() + FLASH_MAX_SCHEDULE_DAYS * 86_400_000)),
    };
    // Sheet her açıldığında yeniden hesaplanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const typeOptions = FLASH_OFFER_TYPES.map((t) => ({
    value: t,
    label: copy.flashForm.types[t],
    icon: t === 'COMPLIMENTARY' ? <Gift className="h-4 w-4" aria-hidden /> : <BadgePercent className="h-4 w-4" aria-hidden />,
  }));
  const durationOptions = FLASH_DURATIONS.map((d) => ({ value: String(d), label: copy.flashForm.duration(d) }));
  const startOptions = [
    { value: 'now' as const, label: copy.flashForm.startNow },
    { value: 'at' as const, label: copy.flashForm.startAt },
  ];

  const previewValue = flashValueLabel(offerType, offerType === 'COMPLIMENTARY' ? null : (values.value ?? null), locale);

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title={copy.flashForm.title}
      description={copy.flashForm.description}
      form={form}
      width="lg"
      submitLabel={values.startMode === 'at' ? copy.flashForm.schedule : copy.flashForm.submit}
      successToast={values.startMode === 'at' ? copy.flashForm.scheduled : copy.flashForm.created}
      onSubmit={(v) => createFlash({ ...v, value: v.offerType === 'COMPLIMENTARY' ? null : v.value, startAt: v.startMode === 'at' ? v.startAt : null })}
      onSaved={onCreated}
    >
      {!hasLocation && (
        <p className="qx-small flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-fg">
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          {copy.flashForm.noLocationWarn}
        </p>
      )}
      <TextField
        control={form.control}
        name="title"
        label={copy.flashForm.titleLabel}
        required
        maxLength={FLASH_TITLE_MAX}
        placeholder={copy.flashForm.titlePlaceholder}
      />
      <TextareaField
        control={form.control}
        name="body"
        label={copy.flashForm.bodyLabel}
        required
        rows={3}
        maxLength={FLASH_BODY_MAX}
        placeholder={copy.flashForm.bodyPlaceholder}
      />
      <Controller
        control={form.control}
        name="offerType"
        render={({ field, fieldState }) => (
          <Field kind="labelledby" label={copy.flashForm.typeLabel} required error={errorMessageOf(fieldState.error)}>
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={typeOptions}
                value={field.value}
                onChange={(next) => {
                  if (!next) return;
                  field.onChange(next);
                  if (next === 'COMPLIMENTARY') form.setValue('value', null, { shouldValidate: false });
                  else if (form.getValues('value') == null) form.setValue('value', next === 'PERCENT' ? 15 : 50);
                }}
                onBlur={field.onBlur}
              />
            )}
          </Field>
        )}
      />
      {offerType !== 'COMPLIMENTARY' && (
        <NumberField
          control={form.control}
          name="value"
          label={copy.flashForm.valueLabel[offerType]}
          description={copy.flashForm.valueHint[offerType]}
          required
          mode="integer"
          min={FLASH_VALUE_LIMITS[offerType].min}
          max={FLASH_VALUE_LIMITS[offerType].max}
          unit={offerType === 'PERCENT' ? '%' : '₺'}
          stepper
        />
      )}
      <Controller
        control={form.control}
        name="durationMinutes"
        render={({ field, fieldState }) => (
          <Field kind="labelledby" label={copy.flashForm.durationLabel} required error={errorMessageOf(fieldState.error)}>
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={durationOptions}
                value={String(field.value)}
                onChange={(next) => next && field.onChange(Number(next))}
                onBlur={field.onBlur}
              />
            )}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="startMode"
        render={({ field }) => (
          <Field kind="labelledby" label={copy.flashForm.startLabel} required>
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={startOptions}
                value={field.value}
                onChange={(next) => {
                  if (!next) return;
                  field.onChange(next);
                  if (next === 'at' && !form.getValues('startAt')) {
                    form.setValue('startAt', utcToIstanbulWall(new Date(Date.now() + 60 * 60_000)).slice(0, 14) + '00');
                  }
                }}
                onBlur={field.onBlur}
              />
            )}
          </Field>
        )}
      />
      {values.startMode === 'at' && (
        <Controller
          control={form.control}
          name="startAt"
          render={({ field, fieldState }) => (
            <Field label={copy.flashForm.startAtLabel} description={copy.flashForm.startAtHint} required error={errorMessageOf(fieldState.error)}>
              {(p) => (
                <Input
                  {...p}
                  type="datetime-local"
                  className="min-h-11"
                  min={bounds.min}
                  max={bounds.max}
                  step={300}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            </Field>
          )}
        />
      )}

      <div className="rounded-lg border border-subtle bg-surface-0 p-3" aria-live="polite">
        <p className="qx-overline mb-2 text-fg-muted">{copy.flashForm.preview}</p>
        <div className="flex items-start gap-3 rounded-md border border-subtle bg-surface-1 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
            {offerType === 'COMPLIMENTARY' ? <Gift className="h-5 w-5" aria-hidden /> : <BadgePercent className="h-5 w-5" aria-hidden />}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="qx-body truncate font-semibold text-fg">{values.title?.trim() || copy.flashForm.titlePlaceholder}</p>
            <p className="qx-small line-clamp-2 text-fg-muted">{values.body?.trim() || copy.flashForm.bodyPlaceholder}</p>
            <p className="qx-caption font-semibold text-brand">
              {previewValue} · {copy.flashForm.duration(values.durationMinutes ?? 30)}
            </p>
          </div>
        </div>
      </div>
    </EntityEditorSheet>
  );
}
