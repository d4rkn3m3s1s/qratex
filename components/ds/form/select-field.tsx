'use client';

import * as React from 'react';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Field } from './field';
import { useFormCopy } from './copy';
import { errorMessageOf, type ConnectedFieldProps } from './connected';

export type SelectOption = {
  /** Radix Select boş dize değer kabul etmez — "seçim yok" için `null` alan değeri kullanın. */
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type SelectOptionGroup = { label: React.ReactNode; options: ReadonlyArray<SelectOption> };

export type SelectFieldProps<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>> = ConnectedFieldProps<T, N> & {
  options?: ReadonlyArray<SelectOption>;
  groups?: ReadonlyArray<SelectOptionGroup>;
  placeholder?: string;
  /**
   * Seçenek dizesini alan değerine çevir (ör. `Number` → sayısal id). Varsayılan: dize.
   * `format` ile tersini verin.
   */
  parse?: (value: string) => unknown;
  format?: (value: unknown) => string;
  triggerClassName?: string;
};

/**
 * Seçim alanı (Radix Select). Tetikleyici etiketle `for` üzerinden bağlıdır; hata ve
 * açıklama `aria-describedby` ile okunur. Klavye: Boşluk/Enter/↓ açar, harfle arar.
 *
 *   <SelectField name="status" label="Durum" required
 *     options={[{ value: 'ACTIVE', label: 'Aktif' }, { value: 'PAUSED', label: 'Duraklatıldı' }]} />
 *   <SelectField name="branchId" label="Şube" options={branches} parse={Number} format={String} />
 */
export function SelectField<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>>({
  name,
  control,
  rules,
  label,
  description,
  required,
  optional,
  hideLabel,
  layout,
  disabled,
  labelAside,
  className,
  id,
  options,
  groups,
  placeholder,
  parse,
  format,
  triggerClassName,
}: SelectFieldProps<T, N>) {
  const copy = useFormCopy();
  const { field, fieldState } = useController<T, N>({ name, control, rules, disabled });
  const error = errorMessageOf(fieldState.error);
  const raw = field.value as unknown;
  const value = raw == null || raw === '' ? '' : format ? format(raw) : String(raw);

  const renderOptions = (list: ReadonlyArray<SelectOption>) =>
    list.map((o) => (
      <SelectItem key={o.value} value={o.value} disabled={o.disabled} className="min-h-11">
        {o.label}
      </SelectItem>
    ));

  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      optional={optional}
      hideLabel={hideLabel}
      layout={layout}
      disabled={disabled}
      labelAside={labelAside}
      className={className}
      id={id}
    >
      {(a11y) => (
        <Select
          name={field.name}
          value={value}
          disabled={field.disabled}
          onValueChange={(v) => field.onChange(parse ? parse(v) : v)}
          onOpenChange={(open) => {
            if (!open) field.onBlur();
          }}
        >
          <SelectTrigger
            {...a11y}
            ref={field.ref}
            className={cn(
              'rounded-control',
              error && 'border-danger focus:ring-danger dark:border-danger',
              triggerClassName,
            )}
          >
            <SelectValue placeholder={placeholder ?? copy.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {options && renderOptions(options)}
            {groups?.map((g, i) => (
              <SelectGroup key={i}>
                <SelectLabel>{g.label}</SelectLabel>
                {renderOptions(g.options)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
