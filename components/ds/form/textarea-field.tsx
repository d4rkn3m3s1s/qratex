'use client';

import * as React from 'react';
import { useController, type FieldPath, type FieldValues } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Textarea, type TextareaProps } from '@/components/ui/textarea';
import { announce } from '../a11y/live-region';
import { Field } from './field';
import { useFormCopy } from './copy';
import { errorMessageOf, type ConnectedFieldProps } from './connected';

export type TextareaFieldProps<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>> = ConnectedFieldProps<T, N> & {
  placeholder?: string;
  rows?: number;
  /** Karakter sınırı — sayaç gösterilir. Şemadaki `.max()` ile aynı olmalı. */
  maxLength?: number;
  /**
   * `true` (varsayılan): tarayıcı sınırı aşmaya izin vermez. `false`: aşılabilir,
   * sayaç tehlike rengine döner ve şema hatası gösterir (yapıştırılan uzun metin kesilmez).
   */
  enforceMaxLength?: boolean;
  /** Sayaç gösterimi: `auto` (sınır varsa), `always`, `never`. */
  showCount?: 'auto' | 'always' | 'never';
  /** İçeriğe göre büyü (`field-sizing: content`, destekleyen tarayıcılarda). */
  autoResize?: boolean;
  emptyAsNull?: boolean;
  textareaProps?: Omit<TextareaProps, 'name' | 'value' | 'onChange' | 'onBlur' | 'id' | 'rows' | 'maxLength'>;
};

/** Sayaç eşikleri: %90'da uyarı rengi + bir kez duyuru; sınırda/aşımda tehlike. */
const WARN_RATIO = 0.9;

/**
 * Çok satırlı metin alanı + karakter sayacı. Sayaç görsel olarak her tuşta güncellenir
 * ama ekran okuyucuya yalnız eşik geçişlerinde duyurulur (her tuşta konuşmaz).
 *
 *   <TextareaField name="note" label="Not" maxLength={500} rows={4} />
 */
export function TextareaField<T extends FieldValues = FieldValues, N extends FieldPath<T> = FieldPath<T>>({
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
  placeholder,
  rows = 4,
  maxLength,
  enforceMaxLength = true,
  showCount = 'auto',
  autoResize = false,
  emptyAsNull = false,
  textareaProps,
}: TextareaFieldProps<T, N>) {
  const copy = useFormCopy();
  const { field, fieldState } = useController<T, N>({ name, control, rules, disabled });
  const error = errorMessageOf(fieldState.error);
  const value = (field.value as string | null | undefined) ?? '';
  const count = value.length;
  const counted = showCount === 'always' || (showCount === 'auto' && typeof maxLength === 'number');
  const ratio = maxLength ? count / maxLength : 0;
  const state: 'ok' | 'warn' | 'limit' | 'over' =
    !maxLength ? 'ok' : count > maxLength ? 'over' : count === maxLength ? 'limit' : ratio >= WARN_RATIO ? 'warn' : 'ok';

  // Yalnız eşik geçişinde duyur.
  const lastState = React.useRef(state);
  React.useEffect(() => {
    if (!maxLength || lastState.current === state) return;
    const prev = lastState.current;
    lastState.current = state;
    if (state === 'warn' && prev === 'ok') announce(copy.charsLeftAnnounce(maxLength - count));
    else if (state === 'limit') announce(copy.charLimitAnnounce);
    else if (state === 'over') announce(copy.charOverAnnounce(maxLength), { politeness: 'assertive' });
  }, [state, maxLength, count, copy]);

  const counter = counted ? (
    <p
      className={cn(
        'qx-caption qx-num text-right',
        state === 'over' || state === 'limit' ? 'text-danger' : state === 'warn' ? 'text-warning' : 'text-fg-muted',
      )}
    >
      {maxLength ? copy.charCount(count, maxLength) : count}
    </p>
  ) : undefined;

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
      footer={counter}
    >
      {(a11y) => (
        <Textarea
          {...textareaProps}
          {...a11y}
          ref={field.ref}
          name={field.name}
          value={value}
          rows={rows}
          maxLength={enforceMaxLength ? maxLength : undefined}
          placeholder={placeholder}
          disabled={field.disabled}
          onChange={(e) => {
            const v = e.target.value;
            field.onChange(emptyAsNull && v === '' ? null : v);
          }}
          onBlur={field.onBlur}
          className={cn(
            'min-h-[5.5rem] rounded-control',
            autoResize && '[field-sizing:content] max-h-[24rem]',
            error && 'border-danger focus-visible:ring-danger dark:border-danger',
            textareaProps?.className,
          )}
        />
      )}
    </Field>
  );
}
