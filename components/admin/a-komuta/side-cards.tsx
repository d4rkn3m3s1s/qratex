'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { EmptyState } from '@/components/states';
import type { EcosystemSection, TopDealersSection } from '@/lib/admin-command/types';
import { formatInt } from './format';
import { useAdminKomutaCopy } from './copy';

const ROLE_META: Record<EcosystemSection['byRole'][number]['role'], { token: string }> = {
  CUSTOMER: { token: '--category-1' },
  DEALER: { token: '--category-2' },
  STAFF: { token: '--category-3' },
  ADMIN: { token: '--category-4' },
};

/** Ekosistem bileşimi (eski /admin/ecosystem'in tek özgün içeriği): rol dağılımı + risk sayıları. */
export function EcosystemCard({ data }: { data: EcosystemSection }) {
  const c = useAdminKomutaCopy();
  const [pre, , post] = c.totalAccounts('');
  const total = Math.max(1, data.total);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        {pre}<span className="font-semibold tabular-nums text-fg">{formatInt(data.total)}</span>{post}
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={data.byRole.map((r) => `${c.role[r.role]} ${r.count}`).join(', ')}>
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
              {c.role[r.role]}
            </span>
            <span className="tabular-nums font-medium text-fg">
              {formatInt(r.count)}
              <span className="ml-1 text-xs font-normal text-fg-muted">%{Math.round((r.count / total) * 100)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">
        {c.within(formatInt(data.flagged), formatInt(data.shadowBanned), formatInt(data.anonymized))}
      </p>
    </div>
  );
}

/** En çok geri bildirim alan bayiler — sıralama SQL'de, seçili pencerede (admin B2). */
export function TopDealersCard({ data, rangeLabel }: { data: TopDealersSection; rangeLabel: string }) {
  const c = useAdminKomutaCopy();
  if (data.dealers.length === 0) {
    return <EmptyState compact title={c.noDealerFeedbackTitle} description={c.noDealerFeedbackDesc(rangeLabel)} />;
  }
  const top = data.dealers[0]!.volume || 1;
  return (
    <ol className="space-y-2" aria-label={c.topDealersAria(rangeLabel)}>
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
                    <span className="sr-only">{c.avgRating}</span>
                    {d.avgRating.toLocaleString(c.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
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
