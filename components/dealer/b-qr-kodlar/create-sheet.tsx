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
    { value: NO_LOCATION, label: 'Şubesiz (işletme geneli)' },
    ...locations.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })),
  ];

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="Yeni QR kod"
      description="Her kod bir temas noktasıdır: masa, kasa, paket ya da vitrin."
      form={form}
      width="lg"
      submitLabel={v.mode === 'series' && preview ? `${preview.count} kod oluştur` : 'Oluştur'}
      successToast={v.mode === 'series' ? 'Kod serisi oluşturuldu' : 'QR kod oluşturuldu'}
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
          {quota?.planName} planında {fmtInt(remaining)} etkin kod hakkınız kaldı ({fmtInt(quota?.used ?? 0)}/{fmtInt(quota?.limit ?? 0)}).
          {overQuota && (
            <>
              {' '}
              Bu kadar kod oluşturulamaz; kullanılmayan kodları arşivleyin ya da{' '}
              <Link href="/dealer/billing" className="font-medium text-brand underline underline-offset-2">
                planınızı yükseltin
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
          <Field kind="labelledby" label="Ne oluşturulsun?" required>
            {(p) => (
              <ChoiceChips
                aria-labelledby={p['aria-labelledby'] as string}
                options={[
                  { value: 'single', label: 'Tek kod', icon: <QrCode className="h-4 w-4" aria-hidden /> },
                  { value: 'series', label: `Numaralı seri (en çok ${QR_SERIES_MAX})`, icon: <ListOrdered className="h-4 w-4" aria-hidden /> },
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
          <TextField control={form.control} name="prefix" label="Ön ek" required maxLength={QR_NAME_MAX - 6} placeholder="Masa" description="Kodlar “Masa 1”, “Masa 2” … diye adlandırılır." />
          <div className="grid grid-cols-2 gap-3">
            <NumberField control={form.control} name="from" label="Başlangıç" required mode="integer" min={0} max={9999} />
            <NumberField control={form.control} name="to" label="Bitiş" required mode="integer" min={0} max={9999} />
          </div>
          {preview && (
            <p className="qx-small text-fg-muted" aria-live="polite">
              {fmtInt(preview.count)} kod: “{preview.first}” … “{preview.last}”
            </p>
          )}
        </>
      ) : (
        <TextField control={form.control} name="name" label="Ad" required maxLength={QR_NAME_MAX} placeholder="Teras — Masa 4" description="Müşteri bu adı görmez; size ve basılı kartta görünür." />
      )}
      <TextareaField control={form.control} name="description" label="Not (isteğe bağlı)" rows={2} maxLength={QR_DESCRIPTION_MAX} />
      <SelectField
        control={form.control}
        name="locationId"
        label="Şube"
        options={locationOptions}
        description={locations.length === 0 ? 'Şube tanımlamadınız; “Şubeler” sekmesinden ekleyebilirsiniz.' : undefined}
      />
      <Controller
        control={form.control}
        name="expiresOn"
        render={({ field, fieldState }) => (
          <Field label="Son kullanma tarihi (isteğe bağlı)" description="Bu günün sonunda (İstanbul saati) kod taramayı durdurur. Kampanya kodları için." error={errorMessageOf(fieldState.error)}>
            {(p) => <Input {...p} type="date" min={today} value={field.value} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} className="min-h-11" />}
          </Field>
        )}
      />
    </EntityEditorSheet>
  );
}
