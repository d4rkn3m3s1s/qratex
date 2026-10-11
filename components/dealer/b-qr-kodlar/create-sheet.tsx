'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Controller, useWatch } from 'react-hook-form';
import { ListOrdered, QrCode } from 'lucide-react';
import { EntityEditorSheet, Field, NumberField, SelectField, TextField, TextareaField, errorMessageOf, useZodForm } from '@/components/ds/form';
import { ChoiceChips } from '@/components/ds/a11y';
import { Input } from '@/components/ui/input';
import {
  NO_LOCATION,
  QR_DESCRIPTION_MAX,
  QR_NAME_MAX,
  QR_SERIES_MAX,
  istanbulDay,
  qrCreateFormSchema,
  seriesPreview,
  toCreateInput,
  type QrCreateForm,
} from '@/lib/dealer/qr-codes/rules';
import type { LocationDto, QuotaDto } from '@/lib/dealer/qr-codes/types';
import { createQr } from './api';
import { fmtInt } from './format';
import { useQrCopy } from './copy';

const DEFAULTS: QrCreateForm = {
  mode: 'single',
  name: '',
  prefix: 'Masa',
  from: 1,
  to: 10,
  description: '',
  locationId: NO_LOCATION,
  expiresOn: '',
};

export function CreateSheet({
  open,
  onOpenChange,
  locations,
  quota,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: LocationDto[];
  quota: QuotaDto | null;
  onCreated: (created: Array<{ id: string; name: string }>) => void;
}) {
  const copy = useQrCopy();
  const c = copy.create;
  const form = useZodForm(qrCreateFormSchema, { defaultValues: DEFAULTS });
  const v = useWatch({ control: form.control }) as Partial<QrCreateForm>;
  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  const preview = v.mode === 'series' ? seriesPreview(v.prefix ?? '', v.from ?? null, v.to ?? null) : null;
  const want = v.mode === 'series' ? (preview?.count ?? 0) : 1;
  const remaining = quota?.limit == null ? null : Math.max(0, quota.limit - quota.used);
  const overQuota = remaining != null && want > remaining;
  const today = useMemo(() => istanbulDay(new Date()), []);

  const locationOptions = [
    { value: NO_LOCATION, label: copy.common.noLocation },
    ...locations.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })),
  ];

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title={c.title}
      description={c.description}
      form={form}
      width="lg"
      submitLabel={v.mode === 'series' && preview ? c.createN(preview.count) : c.create}
      successToast={v.mode === 'series' ? c.seriesDone : c.singleDone}
      onSubmit={(values) => createQr(toCreateInput(values))}
      onSaved={(result) => onCreated((result as { created: Array<{ id: string; name: string }> }).created)}
    >
      {remaining != null && (
        <p
          className={
            overQuota
              ? 'qx-small rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-fg'
              : 'qx-small text-fg-muted'
          }
          role={overQuota ? 'alert' : undefined}
        >
          {c.quotaLeft(quota?.planName ?? '', fmtInt(remaining), fmtInt(quota?.used ?? 0), fmtInt(quota?.limit ?? 0))}
          {overQuota && (
            <>
              {' '}
              {c.overQuota}{' '}
              <Link href="/dealer/settings" className="font-medium text-brand underline underline-offset-2">
                {copy.common.upgrade}
              </Link>
              .
            </>
          )}
        </p>
      )}
      <Controller
        control={form.control}
        name="mode"
        render={({ field }) => (
          <Field kind="labelledby" label={c.what} required>
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={[
                  { value: 'single', label: c.single, icon: <QrCode className="h-4 w-4" aria-hidden /> },
                  { value: 'series', label: c.series(QR_SERIES_MAX), icon: <ListOrdered className="h-4 w-4" aria-hidden /> },
                ]}
                value={field.value}
                onChange={(next) => next && field.onChange(next)}
                onBlur={field.onBlur}
              />
            )}
          </Field>
        )}
      />
      {v.mode === 'series' ? (
        <>
          <TextField control={form.control} name="prefix" label={c.prefix} required maxLength={QR_NAME_MAX - 6} placeholder={c.prefixPlaceholder} description={c.prefixHint} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField control={form.control} name="from" label={c.from} required mode="integer" min={0} max={9999} />
            <NumberField control={form.control} name="to" label={c.to} required mode="integer" min={0} max={9999} />
          </div>
          {preview && (
            <p className="qx-small text-fg-muted" aria-live="polite">
              {c.preview(fmtInt(preview.count), preview.first, preview.last)}
            </p>
          )}
        </>
      ) : (
        <TextField control={form.control} name="name" label={c.name} required maxLength={QR_NAME_MAX} placeholder={c.namePlaceholder} description={c.nameHint} />
      )}
      <TextareaField control={form.control} name="description" label={c.note} rows={2} maxLength={QR_DESCRIPTION_MAX} />
      <SelectField
        control={form.control}
        name="locationId"
        label={c.location}
        options={locationOptions}
        description={locations.length === 0 ? c.noLocations : undefined}
      />
      <Controller
        control={form.control}
        name="expiresOn"
        render={({ field, fieldState }) => (
          <Field label={c.expiry} description={c.expiryHint} error={errorMessageOf(fieldState.error)}>
            {(p) => <Input {...p} type="date" min={today} value={field.value} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} className="min-h-11" />}
          </Field>
        )}
      />
    </EntityEditorSheet>
  );
}
