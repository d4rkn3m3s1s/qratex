'use client';

import { useId } from 'react';
import { MapPin } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ds/page';
import type { DateRangeValue } from '@/components/ds/page/date-range';
import { INSIGHTS_MAX_DAYS } from '@/lib/dealer-insights/params';
import type { InsightsData, InsightsQuery } from '@/lib/dealer-insights/types';
import { useInsightsCopy } from './copy';

const ALL = '__all__';

/**
 * Dönem (hazır + özel aralık + karşılaştırma, İstanbul takvimi) ve şube süzgeci. Değerler
 * URL'de (`period/from/to/compare/location`) — Analitik genel bakışla aynı anahtarlar.
 */
export function InsightsToolbar({
  query,
  locations,
  disabled,
  onChange,
}: {
  query: InsightsQuery;
  locations: InsightsData['locations'];
  disabled?: boolean;
  onChange: (next: { range?: DateRangeValue; location?: string | null }) => void;
}) {
  const { copy } = useInsightsCopy();
  const locId = useId();
  const value: DateRangeValue = { preset: query.preset, range: query.range, compare: query.compare };
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <DateRangePicker
        value={value}
        onChange={(range) => onChange({ range })}
        allowCompare
        maxDays={INSIGHTS_MAX_DAYS}
        label={copy.toolbar.period}
        touchTarget
        disabled={disabled}
      />
      {locations.length > 0 && (
        <div className="flex flex-col gap-1 sm:min-w-[14rem]">
          <Label htmlFor={locId} className="qx-caption text-fg-muted">
            {copy.toolbar.location}
          </Label>
          <Select
            value={query.location ?? ALL}
            onValueChange={(v) => onChange({ location: v === ALL ? null : v })}
            disabled={disabled}
          >
            <SelectTrigger id={locId} className="min-h-11">
              <MapPin className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{copy.toolbar.allLocations}</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
              <SelectItem value="none">{copy.toolbar.noLocation}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
