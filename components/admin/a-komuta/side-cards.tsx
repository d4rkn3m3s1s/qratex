'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { EmptyState } from '@/components/states';
import type { EcosystemSection, TopDealersSection } from '@/lib/admin-command/types';
import { formatInt } from './format';

const ROLE_META: Record<EcosystemSection['byRole'][number]['role'], { label: string; token: string }> = {
  CUSTOMER: { label: 'Müşteri', token: '--category-1' },
  DEALER: { label: 'Bayi', token: '--category-2' },
  STAFF: { label: 'Personel', token: '--category-3' },
  ADMIN: { label: 'Yönetici', token: '--category-4' },
};

/** Ekosistem bileşimi (eski /admin/ecosystem'in tek özgün içeriği): rol dağılımı + risk sayıları. */
export function EcosystemCard({ data }: { data: EcosystemSection }) {
  const total = Math.max(1, data.total);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Toplam <span className="font-semibold tabular-nums text-fg">{formatInt(data.total)}</span> hesap
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={data.byRole.map((r) => `${ROLE_META[r.role].label} ${r.count}`).join(', ')}>
        {data.byRole.map((r) =>
          r.count > 0 ? (
            <span key={r.role} className="h-full" style={{ width: `${(r.count / total) * 100}%`, background: `hsl(var(${ROLE_META[r.role].token}))` }} />
          ) : null
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {data.byRole.map((r) => (
          <li key={r.role} className="flex items-center justify-between gap-2 rounded-md bg-surface-muted px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: `hsl(var(${ROLE_META[r.role].token}))` }} />
              {ROLE_META[r.role].label}
            </span>
            <span className="tabular-nums font-medium text-fg">
              {formatInt(r.count)}
              <span className="ml-1 text-xs font-normal text-fg-muted">%{Math.round((r.count / total) * 100)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">
        İçinde: {formatInt(data.flagged)} işaretli, {formatInt(data.shadowBanned)} gölge yasaklı, {formatInt(data.anonymized)} anonimleştirilmiş hesap.
      </p>
    </div>
  );
}

/** En çok geri bildirim alan bayiler — sıralama SQL'de, seçili pencerede (admin B2). */
export function TopDealersCard({ data, rangeLabel }: { data: TopDealersSection; rangeLabel: string }) {
  if (data.dealers.length === 0) {
    return <EmptyState compact title="Bu dönemde geri bildirim yok" description={`${rangeLabel} içinde hiçbir bayi geri bildirim ya da tüketim yorumu almadı.`} />;
  }
  const top = data.dealers[0]!.volume || 1;
  return (
    <ol className="space-y-2" aria-label={`En çok geri bildirim alan bayiler, ${rangeLabel}`}>
      {data.dealers.map((d, i) => (
        <li key={d.dealerId}>
          <Link
            href="/admin/dealers-health"
            className="block min-h-[44px] rounded-md px-1 py-1 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-fg">
                <span className="mr-1.5 tabular-nums text-fg-muted">{i + 1}.</span>
                {d.name}
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className="font-medium text-fg">{formatInt(d.volume)}</span>
                {d.avgRating != null ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-fg-muted">
                    <Star className="h-3 w-3" aria-hidden />
                    <span className="sr-only">ortalama puan</span>
                    {d.avgRating.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <div className="h-full rounded-full bg-brand" style={{ width: `${(d.volume / top) * 100}%` }} />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
