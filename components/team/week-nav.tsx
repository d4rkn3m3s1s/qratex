'use client';

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ds/a11y';
import { shiftWeekKey, weekKeyLabel } from '@/lib/team-week';

/** Hafta seçici — ok düğmeleri etiketli (denetim #3), "Bu hafta"ya dönüş, seçili hafta duyurulur. */
export function WeekNav({ weekKey, currentWeekKey, onChange }: { weekKey: string; currentWeekKey: string; onChange: (w: string) => void }) {
  const isCurrent = weekKey === currentWeekKey;
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Hafta seçimi">
      <IconButton aria-label="Önceki hafta" icon={<ChevronLeft />} size="sm" variant="outline" onClick={() => onChange(shiftWeekKey(weekKey, -1))} />
      <span className="qx-small qx-num inline-flex min-h-10 items-center gap-1.5 rounded-control border border-subtle bg-surface-1 px-3 font-medium text-fg" aria-live="polite">
        <CalendarDays className="h-4 w-4 text-fg-muted" aria-hidden />
        {weekKeyLabel(weekKey)}
        {isCurrent && <span className="qx-caption text-brand">· bu hafta</span>}
      </span>
      <IconButton aria-label="Sonraki hafta" icon={<ChevronRight />} size="sm" variant="outline" onClick={() => onChange(shiftWeekKey(weekKey, 1))} />
      {!isCurrent && (
        <Button variant="ghost" size="sm" className="h-10" onClick={() => onChange(currentWeekKey)}>
          Bu hafta
        </Button>
      )}
    </div>
  );
}
