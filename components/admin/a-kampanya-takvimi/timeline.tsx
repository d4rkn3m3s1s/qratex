'use client';

import * as React from 'react';
import { AlertTriangle, Coins, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CHIP } from '@/components/states';
import {
  STATUS_LABEL,
  assignLanes,
  barGeometry,
  formatIstanbul,
  formatIstanbulDay,
  type CalendarData,
  type CampaignView,
  type ConceptView,
  type Conflict,
} from '@/lib/campaigns-calendar/contract';
import { STATUS_TONE, campaignEffect, conceptLayers } from './parts';

const DAY = 86_400_000;
const LANE_H = 48; // ≥ 44px dokunma hedefi + 4px aralık

type Props = {
  data: CalendarData;
  onOpen: (kind: 'campaign' | 'concept', id: string) => void;
  /** Vurgulanan çakışma (liste/uyarı panelinden seçilince). */
  focusConflictId?: string | null;
};

function ticks(from: number, to: number): Array<{ at: number; label: string; major: boolean }> {
  const out: Array<{ at: number; label: string; major: boolean }> = [];
  const span = to - from;
  const step = span > 120 * DAY ? 14 : span > 45 * DAY ? 7 : 2;
  // İstanbul gün başlarına hizala (UTC+3 sabit).
  const first = Math.ceil((from + 3 * 3600_000) / DAY) * DAY - 3 * 3600_000;
  for (let t = first, i = 0; t <= to; t += DAY, i++) {
    const d = new Date(t + 3 * 3600_000);
    const isMonthStart = d.getUTCDate() === 1;
    if (isMonthStart || i % step === 0) out.push({ at: t, label: formatIstanbulDay(new Date(t)), major: isMonthStart });
  }
  return out;
}

function Bar({
  item,
  lane,
  from,
  to,
  conflictIds,
  onOpen,
}: {
  item: CampaignView | ConceptView;
  lane: number;
  from: number;
  to: number;
  conflictIds: Set<string>;
  onOpen: Props['onOpen'];
}) {
  const g = barGeometry(item.startDate, item.endDate, from, to);
  if (!g) return null;
  const tone = STATUS_TONE[item.status];
  const muted = item.status === 'ended' || item.status === 'archived' || item.status === 'paused';
  const shadowed = item.status === 'shadowed' || item.status === 'exhausted';
  const detail = item.kind === 'campaign' ? campaignEffect(item) : conceptLayers(item);
  const name = item.kind === 'concept' && item.bannerEmoji ? `${item.bannerEmoji} ${item.name}` : item.name;
  const conflicted = conflictIds.has(item.id);
  const label = `${item.kind === 'campaign' ? 'Kampanya' : 'Konsept'}: ${item.name}. ${STATUS_LABEL[item.status]}${
    item.kind === 'campaign' && item.targeted ? ', hedefli' : ''
  }. ${formatIstanbul(item.startDate)} – ${formatIstanbul(item.endDate)}. ${detail}.${conflicted ? ' Çakışma var.' : ''}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(item.kind, item.id)}
      aria-label={label}
      title={label}
      className={cn(
        'absolute flex h-11 items-center gap-1.5 overflow-hidden rounded-md px-2 text-left transition-[box-shadow,opacity] duration-fast',
        'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1',
        'hover:z-10 hover:shadow-md',
        TONE_CHIP[tone],
        muted && 'opacity-70',
        g.clippedStart && 'rounded-l-none',
        g.clippedEnd && 'rounded-r-none'
      )}
      style={{
        left: `${g.left}%`,
        width: `${g.width}%`,
        top: lane * LANE_H + 2,
        backgroundImage: shadowed
          ? 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, currentColor 14%, transparent) 6px 12px)'
          : undefined,
      }}
    >
      {conflicted && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0 truncate">
        <span className="qx-small font-medium">{name}</span>
        <span className="qx-caption ml-1.5 opacity-80">{detail}</span>
      </span>
    </button>
  );
}

function Track({
  title,
  icon,
  items,
  conflicts,
  from,
  to,
  now,
  onOpen,
  focusConflictId,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<CampaignView | ConceptView>;
  conflicts: Conflict[];
  from: number;
  to: number;
  now: number;
  onOpen: Props['onOpen'];
  focusConflictId?: string | null;
  emptyText: string;
}) {
  const visible = items.filter((i) => barGeometry(i.startDate, i.endDate, from, to));
  const lanes = assignLanes(visible);
  const laneCount = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
  const conflictIds = new Set(conflicts.flatMap((c) => c.itemIds));
  const nowG = now >= from && now <= to ? ((now - from) / (to - from)) * 100 : null;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] border-t border-subtle">
      <div className="flex items-start gap-1.5 border-r border-subtle px-2 py-3 qx-small font-medium text-fg-muted">
        {icon}
        {title}
      </div>
      <div className="relative" style={{ height: laneCount * LANE_H + 4 }}>
        {conflicts.map((c) => {
          const g = barGeometry(c.start, c.end, from, to);
          if (!g) return null;
          const focused = focusConflictId === c.id;
          return (
            <div
              key={c.id}
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-0 border-x',
                c.severity === 'warning' ? 'border-warning-border bg-warning-subtle' : 'border-info-border bg-info-subtle',
                focused ? 'opacity-100' : 'opacity-60'
              )}
              style={{ left: `${g.left}%`, width: `${g.width}%` }}
            />
          );
        })}
        {nowG !== null && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 z-20 w-px bg-brand" style={{ left: `${nowG}%` }} />
        )}
        {visible.length === 0 ? (
          <p className="qx-small absolute inset-0 flex items-center px-3 text-fg-muted">{emptyText}</p>
        ) : (
          visible.map((i) => (
            <Bar key={i.id} item={i} lane={lanes.get(i.id) ?? 0} from={from} to={to} conflictIds={conflictIds} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * İki katmanlı zaman çizelgesi: Ekonomi (kampanyalar) ve Görünüm (konseptler). Örtüşen
 * kayıtlar ayrı şeritlere yerleşir; çakışma aralıkları uyarı zemini ile, "şimdi" marka
 * çizgisiyle gösterilir. Barlar düğmedir (klavye + ekran okuyucu etiketi). Dar ekranda
 * yatay kaydırılır; aynı veri aşağıdaki listede ajanda olarak da durur.
 */
export function CalendarTimeline({ data, onOpen, focusConflictId }: Props) {
  const from = new Date(data.window.from).getTime();
  const to = new Date(data.window.to).getTime();
  const now = new Date(data.summary.now).getTime();
  const t = ticks(from, to);
  const nowPct = now >= from && now <= to ? ((now - from) / (to - from)) * 100 : null;
  const campaignConflicts = data.conflicts.filter((c) => c.kind === 'campaign');
  const conceptConflicts = data.conflicts.filter((c) => c.kind === 'concept' || c.kind === 'cross');

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-subtle bg-surface-1" tabIndex={-1}>
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)]">
          <div className="border-r border-subtle" />
          <div className="relative h-9">
            {t.map((x) => (
              <span
                key={x.at}
                className={cn(
                  'absolute top-0 flex h-full items-end border-l pb-1.5 pl-1 qx-caption tabular-nums',
                  x.major ? 'border-strong font-medium text-fg' : 'border-subtle text-fg-muted'
                )}
                style={{ left: `${((x.at - from) / (to - from)) * 100}%` }}
              >
                {x.label}
              </span>
            ))}
            {nowPct !== null && (
              <span
                className="absolute top-0.5 z-20 -translate-x-1/2 rounded-chip bg-brand px-1.5 py-0.5 qx-caption font-medium text-brand-fg"
                style={{ left: `${nowPct}%` }}
              >
                Şimdi
              </span>
            )}
          </div>
        </div>
        <Track
          title="Ekonomi"
          icon={<Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          items={data.campaigns}
          conflicts={campaignConflicts}
          from={from}
          to={to}
          now={now}
          onOpen={onOpen}
          focusConflictId={focusConflictId}
          emptyText="Bu aralıkta kampanya yok."
        />
        <Track
          title="Görünüm"
          icon={<Palette className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          items={data.concepts}
          conflicts={conceptConflicts}
          from={from}
          to={to}
          now={now}
          onOpen={onOpen}
          focusConflictId={focusConflictId}
          emptyText="Bu aralıkta konsept yok."
        />
      </div>
    </div>
  );
}
