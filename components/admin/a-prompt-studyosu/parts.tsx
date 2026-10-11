'use client';

import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Etiketli, sayaçlı metin alanı — sınır aşılınca uyarı metinle de verilir. */
export function CountedTextarea({
  label,
  value,
  onChange,
  max,
  min,
  rows = 6,
  hint,
  error,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  min?: number;
  rows?: number;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const len = value.trim().length;
  const over = len > max;
  const under = min != null && len > 0 && len < min;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={over || under || !!error || undefined}
        aria-describedby={`${id}-count${hint ? ` ${id}-hint` : ''}${error ? ` ${id}-err` : ''}`}
        className="font-mono text-sm"
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        {hint ? (
          <p id={`${id}-hint`} className="qx-small text-fg-muted">
            {hint}
          </p>
        ) : (
          <span />
        )}
        <p id={`${id}-count`} className={cn('qx-small tabular-nums', over || under ? 'text-danger' : 'text-fg-muted')} aria-live="polite">
          {len} / {max}
          {over ? ' · sınırı aşıyor' : under ? ` · en az ${min}` : ''}
        </p>
      </div>
      {error ? (
        <p id={`${id}-err`} className="qx-small text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Gerekçe alanı — her yazım denetim kaydına bu metinle düşer. */
export function ReasonInput({ value, onChange, error, label = 'Değişiklik gerekçesi' }: { value: string; onChange: (v: string) => void; error?: string | null; label?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
        placeholder="Örn. Yanıtlar çok uzundu, kısaltma kuralı eklendi"
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-err` : `${id}-hint`}
        className="min-h-11 sm:min-h-10"
      />
      {error ? (
        <p id={`${id}-err`} className="qx-small text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="qx-small text-fg-muted">
          Denetim geçmişine yazılır (en az 3 karakter).
        </p>
      )}
    </div>
  );
}

export function reasonOk(v: string): boolean {
  return v.trim().length >= 3;
}

/** Okunur blok — sistem mesajı / prompt metni. */
export function PromptBlock({ text, label, maxHeight = 'max-h-72' }: { text: string; label: string; maxHeight?: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className={cn('overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed text-fg', maxHeight)}
    >
      {text || '—'}
    </pre>
  );
}
