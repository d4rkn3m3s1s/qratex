'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useA11yCopy } from './copy';
import { announce } from './live-region';
import { useRegisterContext, type Register } from '../play/register';

export type ChoiceOption<V extends string = string> = {
  value: V;
  label: React.ReactNode;
  /** Ekran okuyucu adı — `label` metin değilse (ikon/rozet) verin. */
  textLabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

type LabelProps =
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: string; 'aria-labelledby': string };

type CommonProps<V extends string> = LabelProps & {
  options: ReadonlyArray<ChoiceOption<V>>;
  /** `sm` 36px (yoğun filtre çubuğu, dokunma alanı yine 44px) · `md` 44px (varsayılan). */
  size?: 'sm' | 'md';
  /** `ops`: sakin seçili durum (açık marka zemini) · `play`: dolu marka, gölge. */
  register?: Register;
  /** Tek satırda yatay kaydır (mobil filtre şeridi) yerine sarmala (varsayılan: sarmala). */
  scroll?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  'aria-describedby'?: string;
  className?: string;
  onBlur?: () => void;
  ref?: React.Ref<{ focus: () => void }>;
};

export type ChoiceChipsSingleProps<V extends string = string> = CommonProps<V> & {
  mode?: 'single';
  value: V | null | undefined;
  onChange: (value: V | null) => void;
  /** Seçili çipe yeniden basınca seçim kalksın mı (varsayılan: hayır — radyo davranışı). */
  deselectable?: boolean;
};

export type ChoiceChipsMultipleProps<V extends string = string> = CommonProps<V> & {
  mode: 'multiple';
  value: ReadonlyArray<V> | null | undefined;
  onChange: (value: V[]) => void;
  /** En fazla seçim; dolunca kalan çipler devre dışı ve duyurulur. */
  max?: number;
};

export type ChoiceChipsProps<V extends string = string> = ChoiceChipsSingleProps<V> | ChoiceChipsMultipleProps<V>;

/**
 * Çip seçimi. Tekli: WAI-ARIA radiogroup (tek sekme durağı, oklarla gezinip seçer,
 * dairesel). Çoklu: `role="group"` içinde `aria-pressed` butonlar (her biri sekme durağı).
 * Seçili durum yalnız renkle değil, onay ikonuyla da gösterilir.
 *
 *   <ChoiceChips aria-label="Dönem" options={periods} value={p} onChange={setP} />
 *   <ChoiceChips aria-labelledby="tags-label" mode="multiple" max={3}
 *     options={tags} value={selected} onChange={setSelected} />
 */
export function ChoiceChips<V extends string = string>(props: ChoiceChipsProps<V>) {
  const {
    options,
    size = 'md',
    register: registerProp,
    scroll = false,
    disabled = false,
    invalid,
    required,
    id,
    name,
    className,
    onBlur,
    ref,
  } = props;
  // Prop → en yakın RegisterProvider (ör. PanelPage register) → ops.
  const ctxRegister = useRegisterContext();
  const register = registerProp ?? ctxRegister ?? 'ops';
  const copy = useA11yCopy();
  const multiple = props.mode === 'multiple';
  const selected: ReadonlyArray<V> = multiple
    ? (props.value ?? [])
    : props.value != null
      ? [props.value]
      : [];
  const max = multiple ? props.max : undefined;
  const atMax = multiple && max != null && selected.length >= max;
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const enabledIndexes = options.map((o, i) => (o.disabled || disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = options.findIndex((o) => selected.includes(o.value));
  const tabStop = selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : (enabledIndexes[0] ?? 0);

  React.useImperativeHandle(ref, () => ({ focus: () => itemRefs.current[multiple ? (enabledIndexes[0] ?? 0) : tabStop]?.focus() }), [
    multiple,
    tabStop,
    enabledIndexes,
  ]);

  const toggle = (option: ChoiceOption<V>) => {
    if (disabled || option.disabled) return;
    if (props.mode === 'multiple') {
      const isOn = selected.includes(option.value);
      if (!isOn && atMax) {
        announce(copy.choiceMax(max as number), { politeness: 'polite' });
        return;
      }
      props.onChange(isOn ? selected.filter((v) => v !== option.value) : [...selected, option.value]);
    } else {
      const isOn = props.value === option.value;
      if (isOn) {
        if (props.deselectable) props.onChange(null);
        return;
      }
      props.onChange(option.value);
    }
  };

  const onRadioKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (multiple || enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(index);
    let target: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = enabledIndexes[(pos + 1) % enabledIndexes.length];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      target = enabledIndexes[(pos - 1 + enabledIndexes.length) % enabledIndexes.length];
    else if (event.key === 'Home') target = enabledIndexes[0];
    else if (event.key === 'End') target = enabledIndexes[enabledIndexes.length - 1];
    if (target == null) return;
    event.preventDefault();
    const option = options[target];
    if (option) toggle(option);
    itemRefs.current[target]?.focus();
  };

  const play = register === 'play';

  return (
    <div
      id={id}
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']}
      aria-required={!multiple && required ? true : undefined}
      aria-invalid={!multiple && invalid ? true : undefined}
      aria-disabled={disabled || undefined}
      data-register={register}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur?.();
      }}
      className={cn(
        'flex gap-2',
        scroll ? 'no-scrollbar -mx-1 flex-nowrap overflow-x-auto px-1 py-1' : 'flex-wrap',
        className,
      )}
    >
      {options.map((option, index) => {
        const isOn = selected.includes(option.value);
        const blocked = !!option.disabled || disabled;
        const maxBlocked = multiple && !isOn && atMax;
        return (
          <button
            key={option.value}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role={multiple ? undefined : 'radio'}
            aria-checked={multiple ? undefined : isOn}
            aria-pressed={multiple ? isOn : undefined}
            aria-label={option.textLabel}
            aria-disabled={maxBlocked || undefined}
            disabled={blocked}
            tabIndex={multiple ? undefined : index === tabStop ? 0 : -1}
            onClick={() => toggle(option)}
            onKeyDown={(e) => onRadioKeyDown(e, index)}
            className={cn(
              'relative inline-flex shrink-0 cursor-pointer touch-manipulation select-none items-center gap-1.5 rounded-full border font-medium',
              'transition-[color,background-color,border-color,box-shadow] duration-fast ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm'
                ? "qx-small h-9 px-3 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']"
                : 'qx-body h-11 px-4',
              isOn
                ? play
                  ? 'border-transparent bg-brand text-brand-fg qx-elevation-2'
                  : 'border-brand bg-brand-subtle text-brand'
                : 'border-strong bg-surface-1 text-fg hover:bg-surface-3',
              invalid && !isOn && 'border-danger',
              maxBlocked && 'cursor-not-allowed opacity-60',
            )}
          >
            {isOn ? (
              <Check aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            ) : option.icon ? (
              <span aria-hidden className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4">
                {option.icon}
              </span>
            ) : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
      {name &&
        (multiple ? (
          selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)
        ) : (
          <input type="hidden" name={name} value={selected[0] ?? ''} />
        ))}
    </div>
  );
}
