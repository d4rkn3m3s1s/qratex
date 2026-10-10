'use client';

/**
 * Dönem seçici: yıl çipleri + ay çipleri ("Tüm yıl" dahil). Durum URL'de (`?year=&month=`);
 * sunucu sayfası yeni dönemi hesaplar. Geçiş sürerken çip satırı `aria-busy` olur.
 * Bağlantılar gerçek `href` taşır (orta tık / yeni sekme çalışır).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import type { YearSummary } from '@/lib/customer-year/contract';
import type { YearCopy } from './copy';

export const YEAR_PATH = '/customer/me/year';

function hrefFor(year: number, month: number | null) {
  const q = new URLSearchParams({ year: String(year) });
  if (month) q.set('month', String(month));
  return `${YEAR_PATH}?${q.toString()}`;
}

const CHIP =
  'inline-flex min-h-11 shrink-0 whitespace-nowrap items-center justify-center rounded-full border px-4 qx-small font-semibold transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const CHIP_ON = 'border-brand bg-brand text-brand-fg';
const CHIP_OFF = 'border-strong bg-surface-1 text-fg hover:bg-surface-3';

export function PeriodPicker({ summary, copy }: { summary: YearSummary; copy: YearCopy }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { year, month } = summary.period;

  const nav = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    startTransition(() => router.push(href, { scroll: false }));
  };

  return (
    <nav aria-label={copy.periodNav} aria-busy={pending} className={cn('flex flex-col gap-3 transition-opacity duration-base', pending && 'opacity-70')}>
      {summary.availableYears.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className="qx-overline text-muted-foreground" id="year-picker-years">
            {copy.yearsLabel}
          </span>
          <ul aria-labelledby="year-picker-years" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {summary.availableYears.map((y) => {
              const active = y === year;
              const href = hrefFor(y, null);
              return (
                <li key={y}>
                  <Link href={href} onClick={nav(href)} aria-current={active ? 'page' : undefined} className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}>
                    {y}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="qx-overline text-muted-foreground" id="year-picker-months">
          {copy.monthsLabel}
        </span>
        <ul aria-labelledby="year-picker-months" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <li>
            <Link
              href={hrefFor(year, null)}
              onClick={nav(hrefFor(year, null))}
              aria-current={month == null ? 'page' : undefined}
              className={cn(CHIP, month == null ? CHIP_ON : CHIP_OFF)}
            >
              {copy.wholeYear}
            </Link>
          </li>
          {summary.availableMonths.map((m) => {
            const active = m === month;
            const href = hrefFor(year, m);
            return (
              <li key={m}>
                <Link
                  href={href}
                  onClick={nav(href)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={copy.periodLabel(year, m)}
                  className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
                >
                  {copy.monthsShort[m - 1]}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
