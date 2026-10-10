'use client';

import { useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { EntityEditorSheet, Field, TextField, useZodForm, errorMessageOf } from '@/components/ds/form';
import { ChoiceChips } from '@/components/ds/a11y';
import { Input } from '@/components/ui/input';
import {
  HAPPY_HOUR_MULTIPLIER_CHOICES,
  dealerHappyHourSchema,
  type DealerHappyHourInput,
} from '@/lib/dealer/offers/rules';
import { createHappyHour } from './api';
import { useOffersCopy } from './context';

const DEFAULTS: DealerHappyHourInput = {
  name: '',
  multiplier: 2,
  startTime: '15:00',
  endTime: '17:00',
  daysOfWeek: [1, 2, 3, 4, 5],
};

/** Pazartesi'den başlayan gün sırası (0 = Pazar en sonda). */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function HappyHourSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const copy = useOffersCopy();
  const form = useZodForm(dealerHappyHourSchema, { defaultValues: DEFAULTS });

  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  const multiplierOptions = HAPPY_HOUR_MULTIPLIER_CHOICES.map((m) => ({ value: String(m), label: copy.happy.multiplier(m) }));
  const dayOptions = DAY_ORDER.map((d) => ({ value: String(d), label: copy.happy.days[d], textLabel: copy.happy.daysLong[d] }));

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title={copy.happyForm.title}
      description={copy.happyForm.description}
      form={form}
      submitLabel={copy.happyForm.submit}
      successToast={copy.happyForm.created}
      onSubmit={(v) => createHappyHour(v)}
      onSaved={onCreated}
    >
      <TextField control={form.control} name="name" label={copy.happyForm.nameLabel} required maxLength={60} placeholder={copy.happyForm.namePlaceholder} />
      <Controller
        control={form.control}
        name="multiplier"
        render={({ field, fieldState }) => (
          <Field kind="labelledby" label={copy.happyForm.multiplierLabel} required error={errorMessageOf(fieldState.error)}>
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={multiplierOptions}
                value={String(field.value)}
                onChange={(next) => next && field.onChange(Number(next))}
                onBlur={field.onBlur}
              />
            )}
          </Field>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        {(['startTime', 'endTime'] as const).map((name) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field, fieldState }) => (
              <Field label={name === 'startTime' ? copy.happyForm.startLabel : copy.happyForm.endLabel} required error={errorMessageOf(fieldState.error)}>
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    step={900}
                    className="min-h-11 tabular-nums"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              </Field>
            )}
          />
        ))}
      </div>
      <p className="qx-caption -mt-3 text-fg-muted">{copy.happyForm.timeHint}</p>
      <Controller
        control={form.control}
        name="daysOfWeek"
        render={({ field, fieldState }) => (
          <Field kind="labelledby" label={copy.happyForm.daysLabel} required error={errorMessageOf(fieldState.error)}>
            {(p) => (
              <ChoiceChips
                mode="multiple"
                aria-labelledby={p['aria-labelledby'] as string}
                options={dayOptions}
                value={field.value.map(String)}
                onChange={(next) => field.onChange(next.map(Number))}
                onBlur={field.onBlur}
              />
            )}
          </Field>
        )}
      />
    </EntityEditorSheet>
  );
}
