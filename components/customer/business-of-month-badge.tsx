'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, Star } from 'lucide-react';

type Winner = {
  dealerId: string;
  name: string;
  businessCategory: string | null;
  avgRating: number;
  feedbackCount: number;
};
type Record = { periodKey: string; winner: Winner | null };

const MONTH_NAMES = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTH_NAMES[m] ?? ''} ${y}`;
}

/**
 * "Ayın İşletmesi" rozet vitrini — cron'un belirlediği kazananı gösterir.
 * Kazanan yoksa hiç render etmez.
 */
export function BusinessOfMonthBadge() {
  const [record, setRecord] = useState<Record | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/customer/business-of-month', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { businessOfMonth?: Record | null } | null) => {
        if (!cancelled && data?.businessOfMonth?.winner) setRecord(data.businessOfMonth);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !record?.winner) return null;
  const w = record.winner;

  return (
    <Link
      href={`/customer/nearby?focus=${w.dealerId}`}
      className="group block rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-400/15 via-card/60 to-orange-500/10 p-4 shadow-sm transition-all hover:border-amber-400/60 hover:shadow-md"
    >
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-amber-400/25 ring-2 ring-amber-400/40">
          <Crown className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
            🏆 Ayın İşletmesi · {periodLabel(record.periodKey)}
          </p>
          <p className="truncate text-lg font-bold group-hover:text-amber-600 dark:group-hover:text-amber-400">
            {w.name}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {w.avgRating.toFixed(1)}
            </span>
            <span>· {w.feedbackCount} değerlendirme</span>
            {w.businessCategory ? <span>· {w.businessCategory}</span> : null}
          </p>
        </div>
      </div>
    </Link>
  );
}
