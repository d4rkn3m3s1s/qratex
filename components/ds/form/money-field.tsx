'use client';

import * as React from 'react';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { useDsLocale } from '../a11y/copy';
import { Field } from './field';
import { useFormCopy } from './copy';
import { errorMessageOf, type ConnectedFieldProps } from './connected';
import { NumericInput, type NumericParse } from './numeric-input';
import { currencySymbol, formatMinor, formatMinorForEditing, parseMoneyToMinor } from './numeric';

export type MoneyFieldProps<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>> = ConnectedFieldProps<T, N> & {
  /** ISO 4217 (varsayılan `TRY`). Önek sembolü buradan türetilir. */
  currency?: string;
  /** Alt sınır — KURUŞ cinsinden (ör. 100 = 1,00 ₺). */
  minMinor?: number;
  /** Üst sınır — KURUŞ cinsinden. */
  maxMinor?: number;
  /** Negatif tutara izin (iade/düzeltme). Varsayılan: hayır. */
  allowNegative?: boolean;
  /** Ok tuşu adımı (kuruş). Varsayılan: yok. */
  stepMinor?: number;
  placeholder?: string;
};

/**
 * Para alanı — form değeri TAM SAYI KURUŞ (`number | null`). Hiçbir adımda kayan nokta
 * kullanılmaz ("12,30" → 1230). En fazla 2 ondalık; fazlası sessizce yuvarlanmaz, hata verir.
 * Odak dışında "1.234,50" biçiminde, önünde para birimi sembolü.
 *
 *   // şema: price: z.number().int().min(100, 'En az 1 ₺')
 *   <MoneyField name="price" label="Fiyat" minMinor={100} required />
 */
export function MoneyField<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>>({
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
  currency = 'TRY',
  minMinor,
  maxMinor,
  allowNegative = false,
  stepMinor,
  placeholder,
}: MoneyFieldProps<T, N>) {
  const copy = useFormCopy();
  const locale = useDsLocale();
  const { field, fieldState } = useController<T, N>({ name, control, rules, disabled });
  const [localError, setLocalError] = React.useState<string | null>(null);
  const error = localError ?? errorMessageOf(fieldState.error);
  const symbol = React.useMemo(() => currencySymbol(currency, locale), [currency, locale]);

  const parse = (text: string): NumericParse => {
    const p = parseMoneyToMinor(text, locale);
    if (p.kind === 'empty') return p;
    if (p.kind === 'invalid') return { kind: 'invalid', message: copy.invalidMoney };
    if (!allowNegative && p.minor < 0) return { kind: 'invalid', message: copy.negativeNotAllowed };
    return { kind: 'ok', value: p.minor };
  };

  const finalize = (minor: number) => {
    const v = Math.trunc(minor);
    if (typeof minMinor === 'number' && v < minMinor) return { value: v, error: copy.minValue(formatMinor(minMinor, locale, currency)) };
    if (typeof maxMinor === 'number' && v > maxMinor) return { value: v, error: copy.maxValue(formatMinor(maxMinor, locale, currency)) };
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
          toEditText={(v) => formatMinorForEditing(v, locale)}
          toDisplayText={(v) => formatMinor(v, locale)}
          finalize={finalize}
          min={minMinor}
          max={maxMinor}
          step={stepMinor}
          incrementLabel={copy.increment}
          decrementLabel={copy.decrement}
          inputMode="decimal"
          startAdornment={symbol}
          invalid={!!error}
          disabled={field.disabled}
          placeholder={placeholder ?? formatMinor(0, locale)}
          className="text-right"
        />
      )}
    </Field>
  );
}
