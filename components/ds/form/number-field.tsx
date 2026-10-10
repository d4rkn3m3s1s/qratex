'use client';

import * as React from 'react';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { useDsLocale } from '../a11y/copy';
import { Field } from './field';
import { useFormCopy } from './copy';
import { errorMessageOf, type ConnectedFieldProps } from './connected';
import { NumericInput, type NumericParse } from './numeric-input';
import { formatNumberDisplay, formatNumberForEditing, parseLocaleNumber, roundTo } from './numeric';

export type NumberFieldProps<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>> = ConnectedFieldProps<T, N> & {
  /** `integer` (varsayılan): ondalık girişi hatadır · `decimal`: `precision` haneye yuvarlanır. */
  mode?: 'integer' | 'decimal';
  /** Ondalık hane (decimal modda, varsayılan 2). */
  precision?: number;
  min?: number;
  max?: number;
  /** Ok tuşu ve −/+ adımı (varsayılan 1). `0` → adımlama yok. */
  step?: number;
  /** −/+ düğmeleri (adet, kişi, gün sayısı). */
  stepper?: boolean;
  /** Odak çıkışında aralığa sıkıştır (varsayılan: hayır — aralık dışı değer hata gösterir). */
  clampOnBlur?: boolean;
  /** Birim soneki ("adet", "%", "puan"). Ekran okuyucuya `aria-valuetext` ile de söylenir. */
  unit?: string;
  placeholder?: string;
};

/**
 * Sayı alanı — form değeri `number | null`. Türkçe "1,5" ve "1.5" kabul edilir;
 * "1.500" binlik gruptur. Odak dışında gruplu gösterilir (1.500). ↑/↓ adım, Shift ile ×10.
 *
 *   <NumberField name="stock" label="Stok" min={0} stepper unit="adet" />
 *   <NumberField name="rate" label="Oran" mode="decimal" precision={1} min={0} max={100} unit="%" />
 */
export function NumberField<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>>({
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
  mode = 'integer',
  precision = 2,
  min,
  max,
  step = 1,
  stepper = false,
  clampOnBlur = false,
  unit,
  placeholder,
}: NumberFieldProps<T, N>) {
  const copy = useFormCopy();
  const locale = useDsLocale();
  const { field, fieldState } = useController<T, N>({ name, control, rules, disabled });
  const [localError, setLocalError] = React.useState<string | null>(null);
  const error = localError ?? errorMessageOf(fieldState.error);
  const digits = mode === 'integer' ? 0 : Math.max(0, precision);

  const parse = (text: string): NumericParse => {
    const p = parseLocaleNumber(text, locale);
    if (p.kind === 'empty') return p;
    if (p.kind === 'invalid') return { kind: 'invalid', message: copy.invalidNumber };
    if (mode === 'integer' && p.fractionDigits > 0) return { kind: 'invalid', message: copy.integerOnly };
    return { kind: 'ok', value: p.value };
  };

  const fmt = (v: number) => formatNumberDisplay(v, locale, { maxFractionDigits: digits });

  const finalize = (raw: number) => {
    let v = roundTo(raw, digits);
    if (clampOnBlur) {
      if (typeof min === 'number' && v < min) v = min;
      if (typeof max === 'number' && v > max) v = max;
      return { value: v };
    }
    if (typeof min === 'number' && v < min) return { value: v, error: copy.minValue(fmt(min)) };
    if (typeof max === 'number' && v > max) return { value: v, error: copy.maxValue(fmt(max)) };
    return { value: v };
  };

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
        <NumericInput
          {...a11y}
          inputRef={field.ref}
          name={field.name}
          value={field.value as number | null | undefined}
          onChange={(v) => {
            if (localError) setLocalError(null);
            field.onChange(v);
          }}
          onBlur={field.onBlur}
          onLocalError={setLocalError}
          parse={parse}
          toEditText={(v) => formatNumberForEditing(roundTo(v, digits), locale)}
          toDisplayText={fmt}
          finalize={finalize}
          min={min}
          max={max}
          step={step || undefined}
          stepper={stepper}
          spin={!!step}
          valueText={unit ? (v) => `${fmt(v)} ${unit}` : undefined}
          incrementLabel={copy.increment}
          decrementLabel={copy.decrement}
          inputMode={mode === 'integer' && !(typeof min === 'number' && min < 0) ? 'numeric' : 'decimal'}
          endAdornment={unit}
          invalid={!!error}
          disabled={field.disabled}
          placeholder={placeholder}
        />
      )}
    </Field>
  );
}
