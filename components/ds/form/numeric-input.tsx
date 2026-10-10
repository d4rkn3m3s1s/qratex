'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { IconButton } from '../a11y/icon-button';
import type { FieldControlProps } from './field';
import { mergeRefs } from './connected';

export type NumericParse = { kind: 'empty' } | { kind: 'invalid'; message: string } | { kind: 'ok'; value: number };

export type NumericInputProps = Partial<FieldControlProps> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
  /** Metni ayrıştır (yerel ayırıcılar, tam sayı/ondalık kuralları). */
  parse: (text: string) => NumericParse;
  /** Odaktayken gösterilecek metin (gruplamasız). */
  toEditText: (value: number) => string;
  /** Odak dışında gösterilecek metin (gruplu). */
  toDisplayText: (value: number) => string;
  /** Odak çıkışında son biçim (yuvarlama/sınırlama) — sonucu hata ise mesaj döndürür. */
  finalize?: (value: number) => { value: number; error?: string };
  min?: number;
  max?: number;
  /** Ok tuşu / düğme adımı. Verilmezse adımlama yok. */
  step?: number;
  /** −/+ düğmeleri (44px). Dokunmatik sayaçlar (adet, kişi) için. */
  stepper?: boolean;
  incrementLabel: string;
  decrementLabel: string;
  /** `role="spinbutton"` + aria-value* (adımlanan sayılar). */
  spin?: boolean;
  /** Ekran okuyucu değer metni (birimle: "12 adet"). */
  valueText?: (value: number) => string;
  inputMode: 'numeric' | 'decimal';
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  /** Yerel ayrıştırma/aralık hatası (RHF hatasından önce gösterilir). */
  onLocalError?: (message: string | null) => void;
  invalid?: boolean;
  disabled?: boolean;
  name?: string;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
};

/**
 * Sayısal giriş çekirdeği (NumberField / MoneyField). Yazarken metin serbest kalır,
 * geçerli her ara değer forma yazılır; odak çıkışında biçimlenir. Tip `text` +
 * `inputMode` (mobilde sayısal klavye; `type=number`'ın tekerlek/yerel ayar hataları yok).
 */
export function NumericInput({
  value,
  onChange,
  onBlur,
  parse,
  toEditText,
  toDisplayText,
  finalize,
  min,
  max,
  step,
  stepper = false,
  incrementLabel,
  decrementLabel,
  spin = false,
  valueText,
  inputMode,
  startAdornment,
  endAdornment,
  onLocalError,
  invalid,
  disabled,
  name,
  placeholder,
  inputRef,
  className,
  ...a11y
}: NumericInputProps) {
  const [focused, setFocused] = React.useState(false);
  const [text, setText] = React.useState('');
  const localRef = React.useRef<HTMLInputElement>(null);
  const current = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const shown = focused ? text : current == null ? '' : toDisplayText(current);

  const commitStep = (direction: 1 | -1, multiplier = 1) => {
    if (!step || disabled) return;
    // Boşken ilk adım: alt sınır (yoksa 0) — "−"ye basınca anlamsız negatif sayı üretmez.
    let next = current == null ? (typeof min === 'number' ? min : 0) : current + direction * step * multiplier;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    const fixed = finalize ? finalize(next).value : next;
    onChange(fixed);
    onLocalError?.(null);
    if (focused) setText(toEditText(fixed));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!step) return;
    if (event.key === 'ArrowUp') commitStep(1, event.shiftKey ? 10 : 1);
    else if (event.key === 'ArrowDown') commitStep(-1, event.shiftKey ? 10 : 1);
    else if (event.key === 'PageUp') commitStep(1, 10);
    else if (event.key === 'PageDown') commitStep(-1, 10);
    else return;
    event.preventDefault();
  };

  const atMin = current != null && typeof min === 'number' && current <= min;
  const atMax = current != null && typeof max === 'number' && current >= max;

  const input = (
    <div className="relative min-w-0 flex-1">
      {startAdornment && (
        <span aria-hidden className="qx-body pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted">
          {startAdornment}
        </span>
      )}
      <Input
        {...a11y}
        ref={mergeRefs(localRef, inputRef)}
        name={name}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        disabled={disabled}
        error={invalid}
        role={spin ? 'spinbutton' : undefined}
        aria-valuenow={spin && current != null ? current : undefined}
        aria-valuemin={spin ? min : undefined}
        aria-valuemax={spin ? max : undefined}
        aria-valuetext={spin && current != null && valueText ? valueText(current) : undefined}
        value={shown}
        onFocus={() => {
          setFocused(true);
          setText(current == null ? '' : toEditText(current));
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const parsed = parse(t);
          if (parsed.kind === 'empty') onChange(null);
          else if (parsed.kind === 'ok') onChange(parsed.value);
          // geçersiz ara metin ("-", "1.2.") → değer değişmez; hata odak çıkışında
        }}
        onBlur={() => {
          const parsed = parse(text);
          if (parsed.kind === 'invalid') {
            onChange(null);
            onLocalError?.(parsed.message);
          } else if (parsed.kind === 'empty') {
            onChange(null);
            onLocalError?.(null);
          } else {
            const fin = finalize ? finalize(parsed.value) : { value: parsed.value };
            onChange(fin.value);
            onLocalError?.(fin.error ?? null);
          }
          setFocused(false);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'qx-num',
          startAdornment ? 'pl-9' : undefined,
          endAdornment ? 'pr-16' : undefined,
          stepper && 'text-center',
          invalid && 'dark:border-danger',
          className,
        )}
      />
      {endAdornment && (
        <span aria-hidden className="qx-small pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-muted">
          {endAdornment}
        </span>
      )}
    </div>
  );

  if (!stepper || !step) return input;

  return (
    <div className="flex items-stretch gap-2">
      <IconButton
        aria-label={decrementLabel}
        icon={<Minus />}
        variant="outline"
        tabIndex={-1}
        disabled={disabled || atMin}
        onClick={() => commitStep(-1)}
      />
      {input}
      <IconButton
        aria-label={incrementLabel}
        icon={<Plus />}
        variant="outline"
        tabIndex={-1}
        disabled={disabled || atMax}
        onClick={() => commitStep(1)}
      />
    </div>
  );
}
