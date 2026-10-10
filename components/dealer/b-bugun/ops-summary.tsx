'use client';

import Link from 'next/link';
import { AlertTriangle, ClipboardCheck, ListTodo, Package, QrCode } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/components/ds/page';
import { TONE_CHIP, type Tone } from '@/components/states';
import type { OpsSummary as OpsData } from '@/lib/dealer-today/types';
import { TODAY_LINKS } from '@/lib/dealer-today/core';
import { useTodayCopy } from './copy';

function Counter({ href, icon, label, value, sub, tone }: { href: string; icon: ReactNode; label: string; value: number; sub?: string; tone: Tone }) {
  const { tag } = useTodayCopy();
  return (
    <li className="min-w-0">
      <Link
        href={href}
        prefetch={false}
        className="flex h-full min-h-11 items-start gap-3 rounded-control border border-subtle bg-surface-1 p-3 hover:border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-chip [&_svg]:h-4 [&_svg]:w-4', TONE_CHIP[tone])}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-fg-muted">{label}</span>
          <span className="block text-xl font-semibold tabular-nums text-fg">{value.toLocaleString(tag)}</span>
          {sub && <span className="block text-xs text-fg-muted">{sub}</span>}
        </span>
      </Link>
    </li>
  );
}

/**
 * Günlük akış — saf CSS çubukları (recharts yok, ilk boyamada hazır) + aynı verinin ekran
 * okuyucu tablosu. Günler İstanbul takvimi; etiketler istemcide `Intl` ile (eski grafikler
 * sunucuda sabit "Pzt/Sal" ve UTC kova kullanıyordu — copilot B6, operations-brief B6).
 */
function DailyFlow({ daily }: { daily: OpsData['daily'] }) {
  const { copy, tag } = useTodayCopy();
  const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' });
  const full = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const label = (day: string) => weekday.format(new Date(`${day}T12:00:00Z`));
  const max = Math.max(1, ...daily.map((d) => Math.max(d.feedback, d.consumptions)));
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-fg">{copy.ops.dailyTitle}</h3>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-fg-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand" />
          {copy.ops.dailyFeedback}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-info" />
          {copy.ops.dailyConsumptions}
        </span>
      </div>
      <div aria-hidden className="mt-3 grid h-32 grid-cols-7 items-end gap-2">
        {daily.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-col justify-end">
            <div className="flex flex-1 items-end justify-center gap-0.5">
              <span className="w-2.5 rounded-t-sm bg-brand sm:w-3.5" style={{ height: `${(d.feedback / max) * 100}%`, minHeight: d.feedback ? 2 : 0 }} />
              <span
                className="w-2.5 rounded-t-sm bg-info sm:w-3.5"
                style={{ height: `${(d.consumptions / max) * 100}%`, minHeight: d.consumptions ? 2 : 0 }}
              />
            </div>
            <span className="mt-1 truncate text-center text-[0.75rem] text-fg-muted">{label(d.day)}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{copy.ops.dailyTitle}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.ops.day}</th>
            <th scope="col">{copy.ops.dailyFeedback}</th>
            <th scope="col">{copy.ops.dailyConsumptions}</th>
            <th scope="col">{copy.ops.avg}</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <th scope="row">{full.format(new Date(`${d.day}T12:00:00Z`))}</th>
              <td>{d.feedback}</td>
              <td>{d.consumptions}</td>
              <td>{d.avgRating == null ? '—' : d.avgRating.toLocaleString(tag, { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Puan dağılımı — gerçek dağılım (eski panodaki "son 5 kayıttan dağılım" yanıltıcıydı — dealer.md B6). */
function Distribution({ dist, sources }: { dist: OpsData['distribution']; sources: OpsData['sources7d'] }) {
  const { copy, tag } = useTodayCopy();
  const parts: Array<{ key: string; label: string; n: number; cls: string }> = [
    { key: 'pos', label: copy.ops.positive, n: dist.positive, cls: 'bg-success' },
    { key: 'neu', label: copy.ops.neutral, n: dist.neutral, cls: 'bg-warning' },
    { key: 'neg', label: copy.ops.negative, n: dist.negative, cls: 'bg-danger' },
  ];
  const pctOf = (n: number) => (dist.n > 0 ? Math.round((n / dist.n) * 100) : 0);
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-fg">{copy.ops.distributionTitle}</h3>
      {dist.n === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">{copy.ops.noRatings}</p>
      ) : (
        <>
          <div aria-hidden className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
            {parts.map((p) => (p.n > 0 ? <span key={p.key} className={p.cls} style={{ width: `${(p.n / dist.n) * 100}%` }} /> : null))}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', p.cls)} />
                <span className="min-w-0 flex-1 text-fg-muted">{p.label}</span>
                <span className="tabular-nums text-fg">
                  {p.n.toLocaleString(tag)} <span className="text-fg-muted">(%{pctOf(p.n)})</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-muted">{copy.ops.sources(sources.qr, sources.consumption)}</p>
        </>
      )}
    </div>
  );
}

/**
 * Operasyon özeti — eski `/dealer/operations-brief` sayaçları (açık iş, telafi, vaka, katalog)
 * tıklanabilir derin bağlantılar olarak; telafi sayacı artık İŞLETMENİN onayını bekleyen
 * kuyruğu gösterir (operations-brief B4: eskiden müşteride bekleyenleri sayıyordu).
 */
export function OpsSummary({ ops }: { ops: OpsData }) {
  const { copy } = useTodayCopy();
  return (
    <SectionCard title={copy.ops.title} description={copy.ops.desc}>
      <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-5">
        <Counter href={TODAY_LINKS.todos} icon={<ListTodo />} label={copy.ops.openTodos} value={ops.openTodos} sub={copy.ops.overdueTodos(ops.overdueTodos)} tone={ops.overdueTodos > 0 ? 'warning' : 'neutral'} />
        <Counter
          href={TODAY_LINKS.remedyApprovals}
          icon={<ClipboardCheck />}
          label={copy.ops.remedyAwaiting}
          value={ops.remedy.awaitingApproval}
          sub={copy.ops.remedyPending(ops.remedy.pendingCustomer)}
          tone={ops.remedy.awaitingApproval > 0 ? 'danger' : 'neutral'}
        />
        <Counter
          href={TODAY_LINKS.incidents}
          icon={<AlertTriangle />}
          label={copy.ops.incidents}
          value={ops.incidents.open}
          sub={ops.incidents.maxSeverity ? copy.ops.severity[ops.incidents.maxSeverity] : undefined}
          tone={ops.incidents.open > 0 ? 'warning' : 'neutral'}
        />
        <Counter href={TODAY_LINKS.qrCodes} icon={<QrCode />} label={copy.ops.activeQr} value={ops.catalog.activeQr} sub={copy.ops.locations(ops.catalog.locations)} tone="brand" />
        <Counter href={TODAY_LINKS.products} icon={<Package />} label={copy.ops.activeProducts} value={ops.catalog.activeProducts} tone="info" />
      </ul>
      <div className="mt-5 grid gap-6 border-t border-subtle pt-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DailyFlow daily={ops.daily} />
        <Distribution dist={ops.distribution} sources={ops.sources7d} />
      </div>
    </SectionCard>
  );
}
