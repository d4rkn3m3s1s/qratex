'use client';

import { useId } from 'react';
import { useController, type Control } from 'react-hook-form';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { IconButton } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import type { BusinessFormValues, DayHours, WeeklyHours } from '@/lib/dealer-settings/contract';
import { validateWeek } from '@/lib/dealer-settings/hours';
import { DAY_NAMES } from './format';
import { useSettingsCopy } from './copy';

const FULL_DAY = { open: '00:00', close: '24:00' };

function isFullDay(day: DayHours): boolean {
  return day.ranges.length === 1 && day.ranges[0].open === '00:00' && day.ranges[0].close === '24:00';
}

/**
 * Haftalık çalışma saati düzenleyicisi (gün satırı × en çok 3 aralık). Yerel `type="time"`
 * girişleri (klavye + ekran okuyucu dostu); "24 saat açık" ve "gece yarısını aşan" aralık
 * (kapanış < açılış) desteklenir. Kurallar `lib/dealer-settings/hours#validateWeek` ile
 * sunucuyla birebir aynı; hatalar satırın altında metin olarak (yalnız renk değil) gösterilir.
 */
export function HoursEditor({ control, disabled }: { control: Control<BusinessFormValues>; disabled?: boolean }) {
  const { field } = useController({ control, name: 'hours' });
  const week = field.value as WeeklyHours;
  const issues = validateWeek(week);
  const baseId = useId();
  const copy = useSettingsCopy();
  const c = copy.hours;
  const dayName = (i: number) => copy.days[i] ?? DAY_NAMES[i];

  const setDay = (index: number, next: DayHours) => {
    field.onChange(week.map((d, i) => (i === index ? next : d)));
  };

  const copyTo = (from: number, targets: number[]) => {
    const src = week[from];
    field.onChange(week.map((d, i) => (targets.includes(i) ? { open: src.open, ranges: src.ranges.map((r) => ({ ...r })) } : d)));
  };

  return (
    <fieldset className="space-y-2" disabled={disabled} aria-describedby={`${baseId}-help`}>
      <legend className="qx-body font-semibold text-fg">{c.legend}</legend>
      <p id={`${baseId}-help`} className="qx-small text-fg-muted">
        {c.help}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => copyTo(0, [1, 2, 3, 4])} disabled={disabled}>
          <Copy className="h-4 w-4" aria-hidden />
          {c.copyWeekdays}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => copyTo(0, [1, 2, 3, 4, 5, 6])} disabled={disabled}>
          <Copy className="h-4 w-4" aria-hidden />
          {c.copyAll}
        </Button>
      </div>
      <ul className="divide-y divide-subtle rounded-card border border-subtle">
        {week.map((day, i) => {
          const dayIssues = issues.filter((x) => x.day === i);
          const full = isFullDay(day);
          const switchId = `${baseId}-d${i}`;
          return (
            <li key={DAY_NAMES[i]} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
              <div className="flex min-h-11 items-center gap-3 sm:w-44 sm:shrink-0">
                <Switch
                  id={switchId}
                  checked={day.open}
                  onCheckedChange={(open) =>
                    setDay(i, { open, ranges: open && day.ranges.length === 0 ? [{ open: '09:00', close: '18:00' }] : day.ranges })
                  }
                  aria-describedby={dayIssues.length ? `${switchId}-err` : undefined}
                />
                <label htmlFor={switchId} className="qx-body font-medium text-fg">
                  {dayName(i)}
                  <span className="qx-small block font-normal text-fg-muted">{day.open ? (full ? c.allDay : c.open) : c.closed}</span>
                </label>
              </div>
              {day.open && (
                <div className="min-w-0 flex-1 space-y-2">
                  {!full &&
                    day.ranges.map((r, ri) => (
                      <div key={ri} className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`${switchId}-o${ri}`}>
                          {c.rangeOpen(dayName(i), ri + 1)}
                        </label>
                        <input
                          id={`${switchId}-o${ri}`}
                          type="time"
                          step={300}
                          value={r.open}
                          onChange={(e) =>
                            setDay(i, { ...day, ranges: day.ranges.map((x, xi) => (xi === ri ? { ...x, open: e.target.value || '00:00' } : x)) })
                          }
                          className="qx-num h-11 rounded-control border border-strong bg-surface-0 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span aria-hidden className="text-fg-muted">–</span>
                        <label className="sr-only" htmlFor={`${switchId}-c${ri}`}>
                          {c.rangeClose(dayName(i), ri + 1)}
                        </label>
                        <input
                          id={`${switchId}-c${ri}`}
                          type="time"
                          step={300}
                          value={r.close === '24:00' ? '00:00' : r.close}
                          onChange={(e) =>
                            setDay(i, { ...day, ranges: day.ranges.map((x, xi) => (xi === ri ? { ...x, close: e.target.value || '00:00' } : x)) })
                          }
                          className="qx-num h-11 rounded-control border border-strong bg-surface-0 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        {day.ranges.length > 1 && (
                          <IconButton
                            aria-label={c.removeRange(dayName(i), ri + 1)}
                            icon={<Trash2 />}
                            variant="ghost"
                            size="sm"
                            onClick={() => setDay(i, { ...day, ranges: day.ranges.filter((_, xi) => xi !== ri) })}
                          />
                        )}
                      </div>
                    ))}
                  <div className="flex flex-wrap items-center gap-2">
                    {!full && day.ranges.length < 3 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const last = day.ranges[day.ranges.length - 1];
                          setDay(i, { ...day, ranges: [...day.ranges, { open: last?.close && last.close !== '24:00' ? last.close : '18:00', close: '23:00' }] });
                        }}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        {c.addRange}
                      </Button>
                    )}
                    <label className="qx-small inline-flex min-h-11 cursor-pointer items-center gap-2 text-fg-muted">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={full}
                        onChange={(e) => setDay(i, { open: true, ranges: e.target.checked ? [FULL_DAY] : [{ open: '09:00', close: '18:00' }] })}
                      />
                      {c.allDay}
                    </label>
                  </div>
                  {dayIssues.length > 0 && (
                    <p id={`${switchId}-err`} role="alert" className={cn('qx-small text-danger')}>
                      {dayIssues[0].message}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
