'use client';

import * as React from 'react';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Input, type InputProps } from '@/components/ui/input';
import { Field } from './field';
import { errorMessageOf, type ConnectedFieldProps } from './connected';

export type TextFieldProps<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>> = ConnectedFieldProps<T, N> & {
  type?: 'text' | 'email' | 'tel' | 'url' | 'password' | 'search';
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  /** Girişin solunda ikon/önek (ör. `<Search />`, "https://"). Dekoratiftir. */
  startAdornment?: React.ReactNode;
  /** Girişin sağında birim/sonek ("adet", "%"). Dekoratiftir — anlamı etikete de yazın. */
  endAdornment?: React.ReactNode;
  /** Boş metni `null` olarak yaz (isteğe bağlı alanlar, `z.string().nullable()`). */
  emptyAsNull?: boolean;
  /** Baş/son boşluğu odak çıkışında kırp (varsayılan: evet; parola hariç). */
  trimOnBlur?: boolean;
  /** Alttaki `<Input>`'a geçirilecek ek props. */
  inputProps?: Omit<InputProps, 'name' | 'value' | 'onChange' | 'onBlur' | 'type' | 'id'>;
};

/**
 * Metin alanı (RHF + Field). Hata, açıklama ve zorunluluk erişilebilir şekilde bağlanır.
 *
 *   <TextField name="email" label="E-posta" type="email" autoComplete="email" required />
 */
export function TextField<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>>({
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
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  startAdornment,
  endAdornment,
  emptyAsNull = false,
  trimOnBlur,
  inputProps,
}: TextFieldProps<T, N>) {
  const { field, fieldState } = useController<T, N>({ name, control, rules, disabled });
  const error = errorMessageOf(fieldState.error);
  const trim = trimOnBlur ?? type !== 'password';

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
        <div className="relative">
          {startAdornment && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted [&_svg]:h-4 [&_svg]:w-4"
            >
              {startAdornment}
            </span>
          )}
          <Input
            {...inputProps}
            {...a11y}
            ref={field.ref}
            name={field.name}
            type={type}
            value={(field.value as string | null | undefined) ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              field.onChange(emptyAsNull && v === '' ? null : v);
            }}
            onBlur={(e) => {
              if (trim) {
                const v = e.target.value;
                const t = v.trim();
                if (t !== v) field.onChange(emptyAsNull && t === '' ? null : t);
              }
              field.onBlur();
            }}
            disabled={field.disabled}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            maxLength={maxLength}
            error={!!error}
            className={cn(
              startAdornment ? 'pl-10' : undefined,
              endAdornment ? 'pr-14' : undefined,
              error && 'dark:border-danger',
              inputProps?.className,
            )}
          />
          {endAdornment && (
            <span aria-hidden className="qx-small pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-muted">
              {endAdornment}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
