'use client';

import { useMemo } from 'react';
import { m } from 'framer-motion';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import type { WinBackRow } from '@/lib/dealer-customers/types';
import { useCustomersCopy } from './copy';
import { RADAR_MAX_POINTS, RADAR_SIZE, RING, layoutRadar } from './radar-geometry';

const C = RADAR_SIZE / 2;

/**
 * Geri kazanım haritası (SVG, ops kaydı): sonsuz süpürme/nabız YOK; noktalar tek seferlik ve
 * bütçeli (≤ 0,6 sn, ilk 12) girer, azaltılmış harekette statik. Harita `role="img"` ile özetlenir;
 * aynı müşteriler klavye ile listede gezilir (noktalar fareyle/dokunuşla çekmeceyi açar).
 */
export function WinBackRadar({ rows, total, onOpen }: { rows: WinBackRow[]; total: number; onOpen: (ref: string) => void }) {
  const copy = useCustomersCopy();
  const { reduce: reduced } = useMotionPolicy();
  const points = useMemo(
    () =>
      layoutRadar(
        rows.map((r) => ({ ref: r.ref, band: r.band, daysSinceLast: r.daysSinceLast, rhythmDays: r.rhythmDays, visits: r.visits, avgOrderValue: r.avgOrderValue }))
      ),
    [rows]
  );
  const contacted = useMemo(() => new Set(rows.filter((r) => r.contacted).map((r) => r.ref)), [rows]);
  const more = Math.max(0, total - Math.min(rows.length, RADAR_MAX_POINTS));

  return (
    <figure className="space-y-3">
      <div className="mx-auto w-full max-w-[22rem]">
        <svg viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`} role="img" aria-label={copy.radarLabel(points.length)} className="h-auto w-full">
          {/* Halkalar */}
          {(['lost', 'sleeping', 'waking'] as const).map((b) => (
            <circle
              key={b}
              cx={C}
              cy={C}
              r={RING[b][1]}
              className={b === 'waking' ? 'fill-warning/10 stroke-warning/50' : b === 'sleeping' ? 'fill-info/10 stroke-info/40' : 'fill-surface-muted stroke-border'}
              strokeWidth={1}
            />
          ))}
          <circle cx={C} cy={C} r={RING.waking[0]} className="fill-surface-1 stroke-border" strokeWidth={1} />
          {/* Çeyrek ayraçları */}
          <line x1={C} y1={C - RING.lost[1]} x2={C} y2={C + RING.lost[1]} className="stroke-border" strokeDasharray="3 4" />
          <line x1={C - RING.lost[1]} y1={C} x2={C + RING.lost[1]} y2={C} className="stroke-border" strokeDasharray="3 4" />
          {/* Halka etiketleri (üst eksen boyunca) */}
          {(['waking', 'sleeping', 'lost'] as const).map((b) => (
            <text
              key={b}
              x={C + 4}
              y={C - (RING[b][0] + RING[b][1]) / 2 + 3}
              className="fill-fg-muted"
              fontSize={9}
              aria-hidden
            >
              {copy.band[b]}
            </text>
          ))}
          {/* Çeyrek etiketleri */}
          {copy.radarQuadrants.map((label, q) => {
            const a = ((q * 90 + 45) * Math.PI) / 180 - Math.PI / 2;
            const rr = RING.lost[1] + 2;
            const x = C + rr * Math.cos(a);
            const y = C + rr * Math.sin(a);
            return (
              <text key={label} x={x} y={y} textAnchor={x < C ? 'end' : 'start'} className="fill-fg-muted" fontSize={9} aria-hidden>
                {label}
              </text>
            );
          })}
          <text x={C} y={C + 3} textAnchor="middle" className="fill-fg" fontSize={10} fontWeight={600} aria-hidden>
            {total}
          </text>
          {/* Noktalar */}
          {points.map((p, i) => {
            const isContacted = contacted.has(p.ref);
            const delay = reduced || i >= 12 ? 0 : Math.min(i * 0.05, 0.55);
            return (
              <m.circle
                key={p.ref}
                cx={p.x}
                cy={p.y}
                r={p.r}
                tabIndex={-1}
                onClick={() => onOpen(p.ref)}
                className={`cursor-pointer ${isContacted ? 'fill-success stroke-surface-1' : 'fill-brand stroke-surface-1'} hover:opacity-80`}
                strokeWidth={1.5}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: DURATION.base, ease: EASE.standard, delay }}
              />
            );
          })}
        </svg>
      </div>
      <figcaption className="space-y-1">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand" />
            {copy.legendWaiting}
          </span>
          <span className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-success" />
            {copy.legendContacted}
          </span>
          {more > 0 && <span className="qx-caption text-fg-muted">{copy.radarMore(more)}</span>}
        </div>
        <p className="qx-caption text-center text-fg-muted">{copy.radarDesc}</p>
      </figcaption>
    </figure>
  );
}
