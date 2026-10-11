'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { HealthStatus, Tone } from '@/lib/observability/contract';
import { HEALTH_LABEL, HEALTH_TONE } from '@/lib/observability/contract';
import { StatusBadge } from '@/components/ds/data';

export function HealthBadge({ status, label, size = 'sm' }: { status: HealthStatus; label?: string; size?: 'sm' | 'md' }) {
  return <StatusBadge label={label ?? HEALTH_LABEL[status]} tone={HEALTH_TONE[status]} size={size} srPrefix="Durum:" />;
}

/** Erişilebilir tablo kabuğu: görünmez başlık, yatay kaydırma, sütun başlıkları `scope="col"`. */
export function DataGrid({ caption, head, children, className }: { caption: string; head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 overflow-x-auto', className)}>
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cn('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

const BAR_TONE: Record<'good' | 'ni' | 'poor', string> = {
  good: 'bg-success',
  ni: 'bg-warning',
  poor: 'bg-danger',
};

/** İyi / geliştirilmeli / zayıf yığılmış çubuk (metin karşılığı ekran okuyucuda). */
export function RatingBar({ good, ni, poor }: { good: number; ni: number; poor: number }) {
  const n = good + ni + poor;
  if (n === 0) return <div className="h-2 rounded-full bg-surface-muted" aria-hidden />;
  const pct = (v: number) => Math.round((v / n) * 1000) / 10;
  const parts: Array<['good' | 'ni' | 'poor', number]> = [
    ['good', good],
    ['ni', ni],
    ['poor', poor],
  ];
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        {parts.map(([k, v]) => (v > 0 ? <span key={k} className={BAR_TONE[k]} style={{ width: `${pct(v)}%` }} /> : null))}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
        <span>İyi %{pct(good).toLocaleString('tr-TR')}</span>
        <span>Geliştirilmeli %{pct(ni).toLocaleString('tr-TR')}</span>
        <span>Zayıf %{pct(poor).toLocaleString('tr-TR')}</span>
      </p>
    </div>
  );
}

export function NoteText({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <p className={cn('text-xs leading-relaxed', tone === 'warning' ? 'text-warning' : 'text-fg-muted')}>{children}</p>;
}
