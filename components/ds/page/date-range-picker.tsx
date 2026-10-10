'use client';

import { useId, useMemo, useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { usePageCopy, useLocaleTag } from './copy';
import {
  COMPARE_MODES,
  DATE_RANGE_PRESETS,
  addDays,
  compareRangeFor,
  formatDayRange,
  istanbulDay,
  isValidDay,
  rangeLength,
  resolvePreset,
  type CompareMode,
  type DateRangePreset,
  type DateRangeValue,
} from './date-range';

export type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  presets?: readonly Exclude<DateRangePreset, 'custom'>[];
  allowCompare?: boolean;
  allowCustom?: boolean;
  /** Özel aralıkta en uzun süre (gün). */
  maxDays?: number;
  /** Erişilebilir alan adı (ör. "Dönem"). */
  label?: string;
  /** ≥ 44px tetik (mobilde her zaman 44px). */
  touchTarget?: boolean;
  disabled?: boolean;
  /** Test/SSR için sabit "bugün" (İstanbul günü). */
  today?: string;
  className?: string;
};

const radioRow =
  'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-control px-2.5 qx-small text-fg transition-colors duration-fast ease-standard hover:bg-surface-muted has-[:checked]:bg-brand-subtle has-[:checked]:font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring';
const radioInput = 'h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--brand))] focus-visible:outline-none';
const dateInput =
  'h-11 w-full min-w-0 rounded-control border border-strong bg-surface-1 px-3 qx-body text-fg qx-num focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-danger';

/**
 * Dönem seçici — hazır dönemler (radyo grubu, ok tuşlarıyla gezilir), özel
 * aralık (yerel tarih girişleri) ve karşılaştırma modu. Değer
 * `{ preset, range, compare }`; günler İstanbul takvimine göre.
 * Seçim taslakta tutulur, "Uygula" ile yazılır (her tıklamada sorgu atılmaz).
 */
export function DateRangePicker({
  value,
  onChange,
  presets = DATE_RANGE_PRESETS,
  allowCompare = true,
  allowCustom = true,
  maxDays,
  label,
  touchTarget = false,
  disabled,
  today: todayProp,
  className,
}: DateRangePickerProps) {
  const copy = usePageCopy();
  const localeTag = useLocaleTag();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const today = todayProp ?? istanbulDay();

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };

  const selectPreset = (preset: DateRangePreset) => {
    setDraft((d) => ({ ...d, preset, range: preset === 'custom' ? d.range : resolvePreset(preset, today) }));
  };

  const setCustom = (key: 'from' | 'to', day: string) => {
    setDraft((d) => ({ ...d, preset: 'custom', range: { ...d.range, [key]: day } }));
  };

  const error = useMemo(() => {
    if (draft.preset !== 'custom') return null;
    const { from, to } = draft.range;
    if (!isValidDay(from) || !isValidDay(to)) return copy.invalidRange;
    if (from > to) return copy.invalidRange;
    if (maxDays && rangeLength(draft.range) > maxDays) return copy.invalidRange;
    return null;
  }, [draft, maxDays, copy.invalidRange]);

  const apply = () => {
    if (error) return;
    onChange(draft);
    setOpen(false);
  };

  const presetLabel = value.preset === 'custom' ? formatDayRange(value.range, localeTag) : copy.presets[value.preset];
  const rangeText = formatDayRange(value.range, localeTag);
  const cmp = compareRangeFor(value.range, value.compare);
  const triggerLabel = [
    label ?? copy.period,
    `${presetLabel}${value.preset === 'custom' ? '' : ` (${rangeText})`}`,
    cmp ? `${copy.comparedWith}: ${copy.compareModes[value.compare]} (${formatDayRange(cmp, localeTag)})` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const draftCmp = compareRangeFor(draft.range, draft.compare);
  const errorId = `${uid}-err`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={triggerLabel}
          className={cn('h-11 justify-between gap-2 px-3', touchTarget ? '' : 'sm:h-10', className)}
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <span className="min-w-0 truncate qx-small font-medium">{presetLabel}</span>
          {value.compare !== 'none' && (
            <span className="hidden rounded-chip bg-brand-subtle px-1.5 py-0.5 qx-caption font-semibold text-brand md:inline">
              {copy.compare}
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(calc(100vw-2rem),22rem)] rounded-card border-border bg-surface-elevated p-0 qx-elevation-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="flex max-h-[min(80dvh,36rem)] flex-col"
        >
          <div className="space-y-4 overflow-y-auto p-4">
            <fieldset className="space-y-1">
              <legend className="qx-overline mb-1.5 text-fg-muted">{label ?? copy.period}</legend>
              <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {presets.map((p) => (
                  <label key={p} className={radioRow}>
                    <input
                      type="radio"
                      name={`${uid}-preset`}
                      value={p}
                      checked={draft.preset === p}
                      onChange={() => selectPreset(p)}
                      className={radioInput}
                    />
                    {copy.presets[p]}
                  </label>
                ))}
                {allowCustom && (
                  <label className={radioRow}>
                    <input
                      type="radio"
                      name={`${uid}-preset`}
                      value="custom"
                      checked={draft.preset === 'custom'}
                      onChange={() => selectPreset('custom')}
                      className={radioInput}
                    />
                    {copy.custom}
                  </label>
                )}
              </div>
            </fieldset>

            {allowCustom && draft.preset === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="qx-caption font-medium text-fg-muted">{copy.from}</span>
                  <input
                    type="date"
                    value={draft.range.from}
                    max={today}
                    min={maxDays ? addDays(draft.range.to, -(maxDays - 1)) : undefined}
                    onChange={(e) => setCustom('from', e.target.value)}
                    aria-invalid={!!error || undefined}
                    aria-describedby={error ? errorId : undefined}
                    className={dateInput}
                  />
                </label>
                <label className="space-y-1">
                  <span className="qx-caption font-medium text-fg-muted">{copy.to}</span>
                  <input
                    type="date"
                    value={draft.range.to}
                    min={draft.range.from}
                    max={today}
                    onChange={(e) => setCustom('to', e.target.value)}
                    aria-invalid={!!error || undefined}
                    aria-describedby={error ? errorId : undefined}
                    className={dateInput}
                  />
                </label>
                {error && (
                  <p id={errorId} role="alert" className="col-span-2 qx-caption text-danger">
                    {error}
                  </p>
                )}
              </div>
            )}

            {allowCompare && (
              <fieldset className="space-y-1">
                <legend className="qx-overline mb-1.5 text-fg-muted">{copy.compare}</legend>
                {COMPARE_MODES.map((mode: CompareMode) => (
                  <label key={mode} className={radioRow}>
                    <input
                      type="radio"
                      name={`${uid}-compare`}
                      value={mode}
                      checked={draft.compare === mode}
                      onChange={() => setDraft((d) => ({ ...d, compare: mode }))}
                      className={radioInput}
                    />
                    {copy.compareModes[mode]}
                  </label>
                ))}
              </fieldset>
            )}

            <div className="rounded-control bg-surface-muted px-3 py-2 qx-caption text-fg-muted" aria-live="polite">
              <p className="qx-num font-medium text-fg">{formatDayRange(draft.range, localeTag)}</p>
              {draftCmp && (
                <p className="qx-num">
                  {copy.comparedWith}: {formatDayRange(draftCmp, localeTag)}
                </p>
              )}
              <p className="mt-1 text-fg-subtle">{copy.tzNote}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-subtle p-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="sm:h-10">
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={!!error} className="sm:h-10">
              {copy.apply}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
