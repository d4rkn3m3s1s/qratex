'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { InlineError } from '@/components/states';
import { Label } from '@/components/ui/label';
import { useFormCopy } from './copy';

/** Kontrole verilecek erişilebilirlik bağları. */
export type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  /** Grup kontrolleri (radiogroup, chip, rating) için — etiket bunu adlandırır. */
  'aria-labelledby'?: string;
};

export type FieldContextValue = FieldControlProps & {
  labelId: string;
  descriptionId: string;
  errorId: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

/** En yakın `<Field>`'in bağları (özel kontrol yazarken). */
export function useFieldContext(): FieldContextValue | null {
  return React.useContext(FieldContext);
}

export type FieldKind =
  /** Tek giriş: `<label for>` (input, textarea, select tetikleyici, switch). */
  | 'input'
  /** Grup kontrolü (radiogroup/chip/rating/foto): etiket `aria-labelledby` ile bağlanır. */
  | 'labelledby'
  /** Birden fazla giriş (tarih aralığı): `<fieldset>` + `<legend>`. */
  | 'fieldset';

export type FieldProps = {
  label: React.ReactNode;
  /** Yardım metni — etiketin altında, kontrole `aria-describedby` ile bağlı. */
  description?: React.ReactNode;
  /** Hata metni; varsa kontrol `aria-invalid` olur ve hata okunur. */
  error?: React.ReactNode;
  /** Zorunlu işareti (*) + `aria-required`. */
  required?: boolean;
  /** "(isteğe bağlı)" notu — zorunlu alanların çoğunlukta olduğu formlarda. */
  optional?: boolean;
  disabled?: boolean;
  /** Etiketi görsel olarak gizle (arama kutusu vb.); ekran okuyucu okur. */
  hideLabel?: boolean;
  /** `stack` (varsayılan): etiket üstte · `inline`: etiket solda (≥ sm), geniş ayar ekranları. */
  layout?: 'stack' | 'inline';
  kind?: FieldKind;
  /** Kontrol id'si (varsayılan otomatik). */
  id?: string;
  /** Etiket satırının sağına (yardım bağlantısı, sayaç). */
  labelAside?: React.ReactNode;
  /** Kontrolün altına, hata öncesine (karakter sayacı vb.). Kontrole bağlanır. */
  footer?: React.ReactNode;
  className?: string;
  /**
   * Kontrol. Fonksiyon verilirse bağlar parametre olarak gelir (önerilen). Tek öğe
   * verilirse bağlar öğeye eklenir (öğenin kendi değerleri korunur).
   */
  children: React.ReactElement | ((control: FieldControlProps) => React.ReactNode);
};

/**
 * Form alanı çerçevesi: etiket, açıklama, hata, zorunlu işareti ve `aria-describedby`.
 * RHF'ye bağlı değildir — bağlı alanlar (TextField vb.) bunu kullanır; özel kontroller
 * de doğrudan kullanabilir.
 *
 *   <Field label="E-posta" description="Faturalar buraya gelir" error={err} required>
 *     {(p) => <Input type="email" {...p} />}
 *   </Field>
 */
export function Field({
  label,
  description,
  error,
  required = false,
  optional = false,
  disabled = false,
  hideLabel = false,
  layout = 'stack',
  kind = 'input',
  id,
  labelAside,
  footer,
  className,
  children,
}: FieldProps) {
  const copy = useFormCopy();
  const auto = React.useId();
  const controlId = id ?? `f${auto.replace(/:/g, '')}`;
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-desc`;
  const footerId = `${controlId}-footer`;
  const errorId = `${controlId}-error`;
  const hasError = error != null && error !== false && error !== '';

  const describedBy =
    [description ? descriptionId : null, footer ? footerId : null, hasError ? errorId : null].filter(Boolean).join(' ') ||
    undefined;

  const control: FieldControlProps = {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': hasError ? true : undefined,
    'aria-required': required && kind !== 'fieldset' ? true : undefined,
    'aria-labelledby': kind === 'labelledby' ? labelId : undefined,
  };

  const ctx: FieldContextValue = {
    ...control,
    labelId,
    descriptionId,
    errorId,
    invalid: hasError,
    required,
    disabled,
  };

  const labelContent = (
    <>
      {label}
      {required && (
        <span aria-hidden className="ml-0.5 text-danger">
          *
        </span>
      )}
      {/* aria-required olmayan gruplarda (fieldset) zorunluluğu metinle söyle */}
      {required && kind === 'fieldset' && <span className="sr-only"> ({copy.required})</span>}
      {optional && !required && <span className="qx-caption ml-1.5 font-normal text-fg-muted">({copy.optional})</span>}
    </>
  );

  const labelClass = cn(
    'qx-small font-medium text-fg',
    disabled && 'cursor-not-allowed opacity-70',
    hideLabel && 'sr-only',
  );

  const labelNode =
    kind === 'input' ? (
      <Label id={labelId} htmlFor={controlId} className={labelClass}>
        {labelContent}
      </Label>
    ) : kind === 'fieldset' ? (
      <legend id={labelId} className={cn(labelClass, 'mb-1.5 p-0')}>
        {labelContent}
      </legend>
    ) : (
      <span id={labelId} className={labelClass}>
        {labelContent}
      </span>
    );

  let rendered: React.ReactNode;
  if (typeof children === 'function') {
    rendered = children(control);
  } else if (React.isValidElement(children)) {
    const own = children.props as Record<string, unknown>;
    const merged: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(control)) {
      if (v !== undefined && own[k] === undefined) merged[k] = v;
    }
    if (own['aria-describedby'] && describedBy) merged['aria-describedby'] = `${own['aria-describedby'] as string} ${describedBy}`;
    rendered = React.cloneElement(children, merged);
  } else {
    rendered = children;
  }

  const body = (
    <>
      {description && (
        <p id={descriptionId} className="qx-caption text-fg-muted">
          {description}
        </p>
      )}
      <div className={cn(description ? 'mt-1.5' : '')}>{rendered}</div>
      {footer && (
        <div id={footerId} className="mt-1">
          {footer}
        </div>
      )}
      <InlineError id={errorId}>{hasError ? error : null}</InlineError>
    </>
  );

  const Wrapper = kind === 'fieldset' ? 'fieldset' : 'div';

  return (
    <FieldContext.Provider value={ctx}>
      <Wrapper
        className={cn(
          'min-w-0',
          kind === 'fieldset' && 'm-0 border-0 p-0',
          layout === 'inline' && kind !== 'fieldset' ? 'grid gap-1.5 sm:grid-cols-[minmax(10rem,1fr)_2fr] sm:items-start sm:gap-4' : 'flex flex-col gap-1.5',
          className,
        )}
        {...(kind === 'fieldset' ? { 'aria-describedby': describedBy, disabled } : {})}
        data-invalid={hasError || undefined}
      >
        {kind === 'fieldset' ? (
          // <legend> fieldset'in İLK çocuğu olmalı (erişilebilir ad hesabı); satır içi düzen yok.
          <>
            {labelNode}
            {labelAside && <div className="-mt-1 flex justify-end">{labelAside}</div>}
            <div className="min-w-0">{body}</div>
          </>
        ) : layout === 'inline' ? (
          <>
            <div className="flex items-center justify-between gap-2 sm:min-h-11">
              {labelNode}
              {labelAside}
            </div>
            <div className="min-w-0">{body}</div>
          </>
        ) : (
          <>
            <div className="flex items-end justify-between gap-2">
              {labelNode}
              {labelAside}
            </div>
            <div className="min-w-0">{body}</div>
          </>
        )}
      </Wrapper>
    </FieldContext.Provider>
  );
}
