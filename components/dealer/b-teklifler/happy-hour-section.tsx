'use client';

import { useState } from 'react';
import { Clock, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { HappyHourDto, HappyHourSection as HappyHourSectionData, SectionState } from '@/lib/dealer/offers/types';
import { SectionBody } from './section-body';
import { useOffersCopy } from './context';
import { toggleHappyHour } from './api';
import type { OffersCopy } from './copy';

/** "Her gün", "Hafta içi", "Pzt · Çar · Cum" */
export function describeDays(days: number[], copy: OffersCopy): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return copy.happy.everyDay;
  if (set.length === 5 && [1, 2, 3, 4, 5].every((d) => set.includes(d))) return copy.happy.weekdays;
  if (set.length === 2 && set.includes(0) && set.includes(6)) return copy.happy.weekend;
  // Pazartesi'den başlayan okuma sırası.
  return [...set.filter((d) => d !== 0), ...set.filter((d) => d === 0)].map((d) => copy.happy.days[d]).join(' · ');
}

function HappyRow({ hh, onChanged }: { hh: HappyHourDto; onChanged: () => unknown }) {
  const copy = useOffersCopy();
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? hh.isActive;
  const labelId = `hh-${hh.id}-label`;

  async function onToggle(next: boolean) {
    setBusy(true);
    setOptimistic(next);
    try {
      await toggleHappyHour(hh.id, next);
      toast.success(next ? copy.happy.resumedToast : copy.happy.pausedToast);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : copy.sectionError);
    } finally {
      setOptimistic(null);
      setBusy(false);
    }
  }

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3',
        hh.liveNow ? 'border-success-border bg-success-subtle' : 'border-subtle bg-surface-1',
        !checked && 'bg-surface-0',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span id={labelId} className="qx-body min-w-0 truncate font-semibold text-fg">
            {hh.name}
          </span>
          <span className="qx-caption rounded-full bg-brand-subtle px-2 py-0.5 font-semibold text-brand tabular-nums">
            {copy.happy.multiplier(hh.multiplier)}
          </span>
          {hh.liveNow && checked && <StatusBadge label={copy.happy.liveNow} tone="success" icon={Sparkles} size="sm" />}
          {!checked && <StatusBadge label={copy.happy.paused} tone="neutral" size="sm" />}
        </div>
        <p className="qx-small flex flex-wrap items-center gap-x-3 gap-y-0.5 text-fg-muted">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {hh.startTime}–{hh.endTime}
          </span>
          <span>{describeDays(hh.daysOfWeek, copy)}</span>
        </p>
      </div>
      <div className="flex min-h-11 min-w-11 items-center justify-center">
        <Switch
          checked={checked}
          disabled={busy}
          onCheckedChange={(v) => void onToggle(v)}
          aria-label={copy.happy.toggle(hh.name, checked)}
          aria-describedby={labelId}
        />
      </div>
    </li>
  );
}

export function HappyHoursSection({
  state,
  onCreate,
  onChanged,
  onRetry,
}: {
  state: SectionState<HappyHourSectionData>;
  onCreate: () => void;
  onChanged: () => unknown;
  onRetry: () => unknown;
}) {
  const copy = useOffersCopy();
  const ready = state.status === 'ready' ? state.data : null;
  const full = !!ready && ready.activeCount >= ready.maxActive;
  return (
    <SectionCard
      id="mutlu-saatler"
      title={copy.happy.title}
      description={copy.happy.description}
      icon={<Clock />}
      actions={
        ready ? (
          <Button type="button" size="sm" variant="outline" onClick={onCreate} disabled={full} className="min-h-11 gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            {copy.happy.add}
          </Button>
        ) : null
      }
    >
      <SectionBody state={state} disabledText={copy.sectionError} onRetry={onRetry}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              variant="first-use"
              icon={Clock}
              title={copy.happy.empty}
              description={copy.happy.emptyBody}
              compact
              headingLevel="p"
              action={
                <Button type="button" onClick={onCreate} className="min-h-11 gap-1.5">
                  <Plus className="h-4 w-4" aria-hidden />
                  {copy.happy.add}
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              <p className="qx-caption text-fg-muted tabular-nums">{copy.happy.limit(data.activeCount, data.maxActive)}</p>
              <ul className="space-y-2" aria-label={copy.happy.title}>
                {data.items.map((hh) => (
                  <HappyRow key={hh.id} hh={hh} onChanged={onChanged} />
                ))}
              </ul>
            </div>
          )
        }
      </SectionBody>
    </SectionCard>
  );
}
