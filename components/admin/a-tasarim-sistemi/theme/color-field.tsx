'use client';

import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/states';
import { normalizeHex } from '@/lib/design-system/theme-model';
import { useDesignSystemCopy } from '../copy';

/**
 * Renk alanı: bağlı etiket, renk seçici + hex metni. Yarım/geçersiz hex taslağa YAZILMAZ
 * (eskiden yarım "#7c3" bütün arayüzü anlık siyaha çekiyordu); `#RGB` genişletilir.
 */
export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  hint?: string;
}) {
  const fz = useDesignSystemCopy().fx;
  const ux = useDesignSystemCopy().ui;
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = normalizeHex(text) !== null;

  return (
    <div className="space-y-1">
      <label htmlFor={`${id}-hex`} className="qx-small font-medium text-fg">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="qx-caption text-fg-muted">
          {hint}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={fz.colorPicker(label)}
          value={normalizeHex(value) ?? '#000000'}
          onChange={(e) => {
            const n = normalizeHex(e.target.value);
            if (n) onChange(n);
          }}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-control border bg-surface-1 p-1"
        />
        <Input
          id={`${id}-hex`}
          value={text}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          className="min-h-11 font-mono uppercase"
          error={!valid}
          errorId={`${id}-err`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            const n = normalizeHex(v);
            if (n && (v.replace('#', '').length === 6 || v.replace('#', '').length === 3)) onChange(n);
          }}
          onBlur={() => {
            const n = normalizeHex(text);
            if (n) setText(n);
          }}
        />
      </div>
      <InlineError id={`${id}-err`}>{valid ? null : ux.renkRrggbbYaDa}</InlineError>
    </div>
  );
}
