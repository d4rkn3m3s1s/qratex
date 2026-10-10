'use client';

/**
 * "Dayanak" kartları: asistanın çağırdığı her aracın SORGUDAN gelen sayıları. Arayüz sayıyı
 * buradan gösterir (LLM metninden değil) → yanıtın neye dayandığı ölçülebilir
 * (ask-analytics Bulgu 7: "yalnızca gerçek veri" iddiası artık kanıtlı).
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { analyticsHref, inboxHref, periodLabel, topicLabel } from '@/lib/dealer-assistant/labels';
import type { AssistantFact, FactMetric } from '@/lib/dealer-assistant/types';
import { cn } from '@/lib/utils';
import type { AssistantCopy } from './copy';

function fmt(v: number | null | undefined, tag: string, digits = 1): string {
  return v == null ? '—' : v.toLocaleString(tag, { maximumFractionDigits: digits });
}

function Delta({ m, tag, digits = 1, suffix = '' }: { m: FactMetric; tag: string; digits?: number; suffix?: string }) {
  if (m.value == null || m.compare == null) return null;
  const d = Math.round((m.value - m.compare) * 10 ** digits) / 10 ** digits;
  if (d === 0) return <span className="text-fg-subtle">±0</span>;
  const up = d > 0;
  return (
    <span className={up ? 'text-success' : 'text-danger'}>
      {up ? '▲' : '▼'} {Math.abs(d).toLocaleString(tag, { maximumFractionDigits: digits })}
      {suffix}
    </span>
  );
}

function Metric({ label, m, tag, digits = 1, suffix = '', copy }: { label: string; m: FactMetric; tag: string; digits?: number; suffix?: string; copy: AssistantCopy }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-2 px-2.5 py-2">
      <dt className="truncate text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
        <span className="text-base font-semibold text-fg">
          {fmt(m.value, tag, digits)}
          {m.value != null ? suffix : ''}
        </span>
        <span className="text-xs">
          <Delta m={m} tag={tag} digits={digits} suffix={suffix} />
        </span>
      </dd>
      {m.compare != null && <dd className="sr-only">{copy.fact.prev(`${fmt(m.compare, tag, digits)}${suffix}`)}</dd>}
    </div>
  );
}

function Shell({ title, period, href, linkLabel, copy, children }: { title: string; period: string; href?: string; linkLabel?: string; copy: AssistantCopy; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-3" aria-label={`${copy.facts}: ${title}`}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {title} <span className="font-normal normal-case tracking-normal text-fg-subtle">· {period}</span>
        </h4>
        {href && (
          <Link href={href} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            {linkLabel}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: 'neg' | 'pos' | 'neutral' }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div className={cn('h-full rounded-full', tone === 'neg' ? 'bg-danger' : tone === 'pos' ? 'bg-success' : 'bg-brand')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function FactCard({ fact, copy }: { fact: AssistantFact; copy: AssistantCopy }) {
  const tag = copy.tag;
  const per = periodLabel(fact.period, copy.locale);
  switch (fact.tool) {
    case 'get_overview':
      return (
        <Shell title={copy.fact.feedback} period={per} href={analyticsHref(fact.period)} linkLabel={copy.openAnalytics} copy={copy}>
          <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Metric label={copy.fact.feedback} m={fact.volume} tag={tag} digits={0} copy={copy} />
            <Metric label={copy.fact.avgRating} m={fact.avgRating} tag={tag} digits={2} copy={copy} />
            <Metric label={copy.fact.positive} m={fact.positiveShare} tag={tag} suffix="%" copy={copy} />
            <Metric label={copy.fact.replyRate} m={fact.responseRate} tag={tag} suffix="%" copy={copy} />
          </dl>
        </Shell>
      );
    case 'get_topics': {
      const top = fact.topics.slice(0, 5);
      const max = Math.max(1, ...top.map((t) => t.count));
      return (
        <Shell title={copy.fact.topics} period={per} href={analyticsHref(fact.period)} linkLabel={copy.openAnalytics} copy={copy}>
          {top.length === 0 ? (
            <p className="text-xs text-fg-muted">{copy.fact.lowSample}</p>
          ) : (
            <ul className="space-y-1.5">
              {top.map((t) => (
                <li key={t.key} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-fg">{topicLabel(t.key, copy.locale)}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {copy.fact.mentions(t.count)} · <span className="text-danger">−{t.negative}</span> / <span className="text-success">+{t.positive}</span>
                    </span>
                  </div>
                  <Bar value={t.count} max={max} tone={t.negative > t.positive ? 'neg' : t.positive > t.negative ? 'pos' : 'neutral'} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[0.7rem] text-fg-subtle">{copy.fact.analyzedBase(fact.base)}</p>
        </Shell>
      );
    }
    case 'get_trend': {
      const series = fact.series;
      const max = Math.max(1, ...series.map((p) => p.count));
      return (
        <Shell title={copy.fact.trend} period={per} href={analyticsHref(fact.period)} linkLabel={copy.openAnalytics} copy={copy}>
          <div className="flex h-12 items-end gap-px" role="img" aria-label={`${copy.fact.trend}: ${series.reduce((s, p) => s + p.count, 0)}`}>
            {series.map((p) => (
              <div
                key={p.day}
                className={cn('min-w-px flex-1 rounded-t-sm', p.negative > p.count / 2 ? 'bg-danger/70' : 'bg-brand/60')}
                style={{ height: `${Math.max(p.count > 0 ? 8 : 2, Math.round((p.count / max) * 100))}%` }}
                title={`${p.day}: ${p.count}`}
              />
            ))}
          </div>
          {fact.anomalies.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
              {fact.anomalies.slice(0, 3).map((a) => (
                <li key={`${a.day}-${a.kind}`}>{copy.fact.anomaly(a.day)} ({a.value.toLocaleString(tag)})</li>
              ))}
            </ul>
          )}
        </Shell>
      );
    }
    case 'get_locations': {
      const rows = fact.rows.slice(0, 5);
      return (
        <Shell title={copy.fact.locations} period={per} href={analyticsHref(fact.period)} linkLabel={copy.openAnalytics} copy={copy}>
          <ul className="divide-y divide-border text-xs">
            {rows.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-2 py-1">
                <span className="min-w-0 truncate text-fg">{r.locationName ? `${r.locationName} · ${r.name}` : r.name}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  {fmt(r.avgRating, tag, 2)} ★ · {r.feedbacks.toLocaleString(tag)}
                </span>
              </li>
            ))}
          </ul>
        </Shell>
      );
    }
    case 'get_busy_times':
      return (
        <Shell title={copy.fact.busiestDay} period={per} href={analyticsHref(fact.period)} linkLabel={copy.openAnalytics} copy={copy}>
          {!fact.peakDay && !fact.peakHour ? (
            <p className="text-xs text-fg-muted">{copy.fact.lowSample}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-1.5 text-xs">
              {fact.peakDay && (
                <div className="rounded-md bg-surface-2 px-2.5 py-2">
                  <dt className="text-fg-muted">{copy.fact.busiestDay}</dt>
                  <dd className="font-semibold text-fg">{copy.fact.weekdays[fact.peakDay.day] ?? fact.peakDay.day}</dd>
                </div>
              )}
              {fact.peakHour && (
                <div className="rounded-md bg-surface-2 px-2.5 py-2">
                  <dt className="text-fg-muted">{copy.fact.busiestHour}</dt>
                  <dd className="font-semibold tabular-nums text-fg">{String(fact.peakHour.hour).padStart(2, '0')}:00</dd>
                </div>
              )}
              {fact.qualityDip && (
                <div className="col-span-2 rounded-md bg-surface-2 px-2.5 py-2">
                  <dt className="text-fg-muted">{copy.fact.dip}</dt>
                  <dd className="tabular-nums text-fg">
                    {copy.fact.weekdays[fact.qualityDip.day] ?? fact.qualityDip.day} {String(fact.qualityDip.hour).padStart(2, '0')}:00 · {fmt(fact.qualityDip.avgRating, tag, 2)} ★ ({fmt(fact.qualityDip.baseline, tag, 2)})
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Shell>
      );
    case 'search_feedback':
      return (
        <Shell
          title={copy.fact.search(fact.query)}
          period={per}
          href={inboxHref(fact.period, { q: fact.method === 'keyword' ? fact.query : null, sentiment: fact.filters.sentiment })}
          linkLabel={copy.openInbox}
          copy={copy}
        >
          <p className="text-xs text-fg-muted">
            {copy.fact.matched(fact.matched, fact.returned)} · {copy.fact.method[fact.method] ?? fact.method}
          </p>
        </Shell>
      );
    case 'get_churn_risk':
      return (
        <Shell title={copy.fact.churn} period={per} href="/dealer/customers?tab=risk" linkLabel={copy.openRisk} copy={copy}>
          <dl className="grid grid-cols-3 gap-1.5">
            <Metric label={copy.fact.highRisk} m={{ value: fact.highRisk, compare: null }} tag={tag} digits={0} copy={copy} />
            <Metric label={copy.fact.urgent} m={{ value: fact.urgent, compare: null }} tag={tag} digits={0} copy={copy} />
            <Metric label={copy.fact.analyzed} m={{ value: fact.analyzed, compare: null }} tag={tag} digits={0} copy={copy} />
          </dl>
          {fact.topics.length > 0 && (
            <p className="mt-2 text-xs text-fg-muted">
              {fact.topics.slice(0, 4).map((t) => `${topicLabel(t.key, copy.locale)} (${t.count})`).join(' · ')}
            </p>
          )}
        </Shell>
      );
    default:
      return null;
  }
}

/** Aynı aracın aynı dönemdeki tekrarları tek kartta gösterilir (son sonuç geçerli). */
export function dedupeFacts(facts: AssistantFact[]): AssistantFact[] {
  const map = new Map<string, AssistantFact>();
  for (const f of facts) {
    const key = f.tool === 'search_feedback' ? `${f.tool}:${f.period}:${f.query ?? ''}:${f.filters.sentiment ?? ''}` : `${f.tool}:${f.period}`;
    map.set(key, f);
  }
  return [...map.values()];
}
