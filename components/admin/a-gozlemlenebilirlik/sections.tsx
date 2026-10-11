'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Search, Server, Gauge, Cloud, BookOpen, Webhook, GitCommit } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile, StatusBadge, KeyValueList } from '@/components/ds/data';
import { EmptyState, ErrorState } from '@/components/states';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { HealthView, PlatformView, Section, TrafficView, VitalsView, ObsWindow } from '@/lib/observability/contract';
import { OBS_WINDOW_LABEL, PLATFORM_TONE_UI, VITAL_META } from '@/lib/observability/contract';
import { DataGrid, HealthBadge, NoteText, RatingBar } from './parts';
import { fmtAgo, fmtDateTime, fmtHour, fmtInt, fmtMs, fmtPct, fmtVital } from './format';

function SectionError({ section, onRetry }: { section: { ok: false; error: string }; onRetry: () => void }) {
  return <ErrorState title="Bu bölüm yüklenemedi" description={section.error} onRetry={onRetry} />;
}

const RATING_TONE = { good: 'success', 'needs-improvement': 'warning', poor: 'danger' } as const;
const RATING_LABEL = { good: 'İyi', 'needs-improvement': 'Geliştirilmeli', poor: 'Zayıf' } as const;

// ───────────────────────────── Sağlık ─────────────────────────────

export function HealthSection({ section, jobs, onRetry }: { section: Section<HealthView>; jobs: React.ReactNode; onRetry: () => void }) {
  return (
    <SectionCard id="saglik" title="Uygulama ve bağımlılıklar" description="Komuta Merkezi ile aynı ölçüm: veritabanı gecikmesi, önbellek yaz/oku sınaması, AI, posta." icon={<Server className="h-4 w-4" aria-hidden />}>
      {!section.ok ? (
        <SectionError section={section} onRetry={onRetry} />
      ) : (
        <div className="space-y-4">
          <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.data.checks.map((c) => (
              <li key={c.id} className="min-w-0 rounded-lg border border-border p-3 transition-colors duration-200">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{c.label}</p>
                  <HealthBadge status={c.status} />
                </div>
                <p className="mt-1 text-sm text-fg-muted">{c.detail}</p>
                {!c.href.startsWith('/admin/observability') && (
                  <Link href={c.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                    Ayrıntıya git
                  </Link>
                )}
              </li>
            ))}
            <li className="min-w-0 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Webhook className="h-4 w-4 text-fg-muted" aria-hidden /> Webhook teslimleri (24 sa)
                </p>
                {section.data.webhooks ? (
                  <HealthBadge
                    status={section.data.webhooks.deliveries24h === 0 ? 'ok' : (section.data.webhooks.failureRatePct ?? 0) >= 10 ? 'warn' : 'ok'}
                    label={section.data.webhooks.deliveries24h === 0 ? 'Teslim yok' : undefined}
                  />
                ) : (
                  <HealthBadge status="unknown" />
                )}
              </div>
              <p className="mt-1 text-sm text-fg-muted">
                {section.data.webhooks
                  ? section.data.webhooks.deliveries24h === 0
                    ? 'Son 24 saatte webhook teslimi olmadı.'
                    : `${fmtInt(section.data.webhooks.deliveries24h)} teslim · ${fmtInt(section.data.webhooks.failures24h)} başarısız (${fmtPct(section.data.webhooks.failureRatePct)})`
                  : 'Teslim sayıları okunamadı.'}
              </p>
              <Link href="/admin/integrations?tab=webhooklar" className="mt-2 inline-flex min-h-11 items-center rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Teslim günlüğü
              </Link>
            </li>
            <li className="min-w-0">{jobs}</li>
          </ul>
          <div className="rounded-lg bg-surface-muted p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <GitCommit className="h-3.5 w-3.5" aria-hidden /> Dağıtım
            </p>
            <KeyValueList
              layout="grid"
              columns={3}
              dense
              items={[
                { id: 'env', label: 'Ortam', value: section.data.deploy.vercelEnv ?? 'Yerel / bilinmiyor' },
                { id: 'region', label: 'Bölge', value: section.data.deploy.region ?? '—' },
                { id: 'sha', label: 'Sürüm', value: section.data.deploy.commitSha ? `${section.data.deploy.commitSha}${section.data.deploy.commitRef ? ` (${section.data.deploy.commitRef})` : ''}` : '—' },
              ]}
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── Uç metrikleri ─────────────────────────────

export function TrafficSection({ section, window, onRetry }: { section: Section<TrafficView>; window: ObsWindow; onRetry: () => void }) {
  return (
    <SectionCard id="uclar" title="API uçları: hata oranı ve yavaş uçlar" description={`${OBS_WINDOW_LABEL[window]} · saatlik kovalar · gerçek trafik`} icon={<Gauge className="h-4 w-4" aria-hidden />}>
      {!section.ok ? (
        <SectionError section={section} onRetry={onRetry} />
      ) : !section.data.collecting ? (
        <EmptyState title="Uç metrikleri toplanmıyor" description={section.data.reason} />
      ) : section.data.totals.requests === 0 ? (
        <EmptyState title="Bu pencerede ölçülen istek yok" description="Ölçüm açık; trafik geldikçe sayılar burada görünür." />
      ) : (
        <TrafficBody data={section.data} />
      )}
    </SectionCard>
  );
}

function TrafficBody({ data }: { data: Extract<TrafficView, { collecting: true }> }) {
  const t = data.totals;
  const reqSeries = data.series.map((s) => s.requests);
  const errSeries = data.series.map((s) => (s.requests > 0 ? Math.round((s.errors5xx / s.requests) * 1000) / 10 : null));
  const errTone = (t.errorRatePct ?? 0) >= 5 ? 'danger' : (t.errorRatePct ?? 0) >= 1 ? 'warning' : 'success';
  return (
    <div className="space-y-5">
      <MetricGrid cols={4}>
        <MetricTile label="İstek" metric={{ value: t.requests, format: 'number', compact: true, series: data.series.length > 1 ? reqSeries : null }} sparklineLabel={`Saatlik istek: ${reqSeries.join(', ')}`} />
        <MetricTile label="Sunucu hata oranı (5xx)" tone={errTone} metric={{ value: t.errorRatePct, format: 'percent', series: data.series.length > 1 ? errSeries : null }} hint={`${fmtInt(t.errors5xx)} adet 5xx`} />
        <MetricTile label="İstemci hataları (4xx)" metric={{ value: t.errors4xx, format: 'number' }} hint="Yetki, doğrulama, hız sınırı" />
        <MetricTile label="p95 yanıt süresi" metric={{ value: t.p95Ms, format: 'number', unit: 'ms' }} hint={t.p95AtLeast ? 'En az bu kadar (üst kova)' : 'Yaklaşık (histogramdan)'} />
      </MetricGrid>

      {data.series.length > 1 && (
        <details className="rounded-lg border border-border p-3 text-sm">
          <summary className="min-h-11 cursor-pointer content-center font-medium">Saatlik döküm</summary>
          <DataGrid caption="Saatlik istek ve 5xx sayıları" head={['Saat', 'İstek', '5xx']}>
            {data.series.map((s) => (
              <tr key={s.hourStart}>
                <td className="px-3 py-1.5 tabular-nums">{fmtHour(s.hourStart)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(s.requests)}</td>
                <td className={cn('px-3 py-1.5 text-right tabular-nums', s.errors5xx > 0 && 'text-danger')}>{fmtInt(s.errors5xx)}</td>
              </tr>
            ))}
          </DataGrid>
        </details>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold">En çok hata veren uçlar</h3>
          {data.topErrors.length === 0 ? (
            <p className="text-sm text-fg-muted">Bu pencerede 5xx dönen uç yok.</p>
          ) : (
            <DataGrid caption="5xx sayısına göre uçlar" head={['Uç', 'İstek', '5xx', 'Oran']}>
              {data.topErrors.map((r) => (
                <tr key={r.route}>
                  <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-xs" title={r.route}>{r.route}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.requests)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-danger">{fmtInt(r.errors5xx)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.errorRatePct)}</td>
                </tr>
              ))}
            </DataGrid>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold">En yavaş uçlar (p95, en az 5 istek)</h3>
          {data.slowest.length === 0 ? (
            <p className="text-sm text-fg-muted">Sıralama için yeterli istek yok.</p>
          ) : (
            <DataGrid caption="p95 yanıt süresine göre uçlar" head={['Uç', 'İstek', 'p50', 'p95']}>
              {data.slowest.map((r) => (
                <tr key={r.route}>
                  <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-xs" title={r.route}>{r.route}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.requests)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMs(r.p50Ms)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', (r.p95Ms ?? 0) >= 2500 ? 'text-danger' : (r.p95Ms ?? 0) >= 1000 ? 'text-warning' : '')}>
                    {fmtMs(r.p95Ms, r.p95AtLeast)}
                  </td>
                </tr>
              ))}
            </DataGrid>
          )}
        </div>
      </div>
      <NoteText>
        Kapsam: `defineRoute` ile yazılmış {fmtInt(data.routeCount)} uç ölçüldü; eski elle yazılmış uçlar bu tabloya girmez. Yüzdelikler
        gecikme kovalarından yaklaşık hesaplanır. Ayrıntılı iz için Sentry ve Vercel günlükleri kullanılır.
      </NoteText>
    </div>
  );
}

// ───────────────────────────── Web Vitals ─────────────────────────────

export function VitalsSection({ section, onRetry }: { section: Section<VitalsView>; onRetry: () => void }) {
  return (
    <SectionCard id="rum-web-vitals" title="Sayfa performansı (Web Vitals)" description="Oturumlu panellerden gerçek kullanıcı ölçümleri · son 24 saat · p75 (Google değerlendirmesiyle aynı)">
      {!section.ok ? (
        <SectionError section={section} onRetry={onRetry} />
      ) : !section.data.collecting ? (
        <EmptyState title="Web Vitals saklanmıyor" description={`${section.data.reason} Vercel Speed Insights panelinden genel görünüm alınabilir.`} />
      ) : section.data.metrics.every((m) => m.n === 0) ? (
        <EmptyState title="Henüz örnek yok" description="Paneller kullanıldıkça sayfa kapanırken örnekler gönderilir; ilk veriler birkaç dakika içinde görünür." />
      ) : (
        <div className="space-y-5">
          <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {section.data.metrics.map((m) => (
              <li key={m.name} className="min-w-0 rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold" title={VITAL_META[m.name].label}>
                    {m.name}
                    <span className="sr-only"> ({VITAL_META[m.name].label})</span>
                  </p>
                  {m.rating ? <StatusBadge size="sm" tone={RATING_TONE[m.rating]} label={RATING_LABEL[m.rating]} /> : <StatusBadge size="sm" tone="neutral" label="Veri yok" />}
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtVital(m.name, m.p75, m.p75AtLeast)}</p>
                <p className="text-xs text-fg-muted">
                  p75 · {fmtInt(m.n)} örnek · hedef ≤ {fmtVital(m.name, VITAL_META[m.name].good)}
                </p>
                <div className="mt-2">
                  <RatingBar good={m.good} ni={m.needsImprovement} poor={m.poor} />
                </div>
              </li>
            ))}
          </ul>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            {(['LCP', 'INP'] as const).map((name) => (
              <div key={name} className="min-w-0">
                <h3 className="mb-2 text-sm font-semibold">En yavaş sayfalar · {name} p75</h3>
                {section.data.collecting && section.data.worstPaths[name].length === 0 ? (
                  <p className="text-sm text-fg-muted">Sayfa kırılımı için en az 5 örnekli sayfa yok.</p>
                ) : (
                  <DataGrid caption={`${name} p75 değerine göre en yavaş sayfalar`} head={['Sayfa', 'Örnek', 'p75']}>
                    {section.data.collecting &&
                      section.data.worstPaths[name].map((r) => (
                        <tr key={r.path}>
                          <td className="max-w-[18rem] truncate px-3 py-2 font-mono text-xs" title={r.path}>{r.path}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.n)}</td>
                          <td className={cn('px-3 py-2 text-right tabular-nums', r.rating === 'poor' ? 'text-danger' : r.rating === 'needs-improvement' ? 'text-warning' : '')}>
                            {fmtVital(name, r.p75, r.p75AtLeast)}
                          </td>
                        </tr>
                      ))}
                  </DataGrid>
                )}
              </div>
            ))}
          </div>
          <NoteText>Kimlikler yoldan çıkarılır (`/admin/users/:id`); derece sunucuda değerden hesaplanır. Örnekler sayfa başına tek istekte gelir.</NoteText>
        </div>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── Vercel ─────────────────────────────

export function PlatformSection({ section, onRetry }: { section: Section<PlatformView>; onRetry: () => void }) {
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [q, setQ] = useState('');
  const comps = useMemo(() => {
    if (!section.ok) return [];
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return section.data.components.filter((c) => (!onlyProblems || c.tone !== 'ok') && (!needle || c.name.toLocaleLowerCase('tr-TR').includes(needle)));
  }, [section, onlyProblems, q]);

  return (
    <SectionCard
      title="Barındırma platformu (Vercel)"
      description="Statuspage kaynağı · 60 sn önbellek"
      icon={<Cloud className="h-4 w-4" aria-hidden />}
      actions={
        section.ok ? <StatusBadge tone={PLATFORM_TONE_UI[section.data.indicator.tone]} label={section.data.indicator.label} srPrefix="Platform durumu:" /> : undefined
      }
    >
      {!section.ok ? (
        <SectionError section={section} onRetry={onRetry} />
      ) : (
        <div className="space-y-4">
          {section.data.incidents.length > 0 && (
            <ul className="space-y-2" aria-label="Açık olaylar">
              {section.data.incidents.map((i) => (
                <li key={i.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge size="sm" tone={PLATFORM_TONE_UI[i.impactTone]} label={i.statusLabel} />
                    <p className="min-w-0 flex-1 text-sm font-medium">{i.name}</p>
                    {i.shortlink && (
                      <a href={i.shortlink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded text-sm text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        Detay <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">(yeni sekmede açılır)</span>
                      </a>
                    )}
                  </div>
                  {i.latestUpdate && <p className="mt-1 text-sm text-fg-muted">{i.latestUpdate}</p>}
                  <p className="mt-1 text-xs text-fg-muted">Son güncelleme: {fmtDateTime(i.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
          {section.data.maintenances.length > 0 && (
            <ul className="space-y-1 text-sm" aria-label="Planlı bakımlar">
              {section.data.maintenances.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <StatusBadge size="sm" tone="info" label="Planlı bakım" />
                  <span>{m.name}</span>
                  <span className="text-fg-muted">· {fmtDateTime(m.scheduledFor)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-fg-muted">
            {fmtInt(section.data.operationalCount)} / {fmtInt(section.data.components.length)} bileşen çalışıyor.
          </p>
          <details className="rounded-lg border border-border p-3" open={section.data.components.some((c) => c.tone !== 'ok')}>
            <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Bileşenler</summary>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Bileşen ara</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bileşen ara" className="h-11 pl-9" />
              </label>
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
                Yalnız sorunlular
              </label>
            </div>
            {comps.length === 0 ? (
              <p className="mt-3 text-sm text-fg-muted">{onlyProblems ? 'Sorunlu bileşen yok.' : 'Eşleşen bileşen yok.'}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {comps.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate" title={c.name}>{c.name}</span>
                    <StatusBadge size="sm" tone={PLATFORM_TONE_UI[c.tone]} label={c.label} />
                  </li>
                ))}
              </ul>
            )}
          </details>
          <NoteText>Alındı: {fmtAgo(section.data.fetchedAt)}</NoteText>
        </div>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── Rehber ─────────────────────────────

export function GuideSection() {
  return (
    <div id="core-web-vitals" className="min-w-0 scroll-mt-24">
      <details className="rounded-xl border border-border bg-surface-1 p-4">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-fg-muted" aria-hidden /> Rehber: Web Vitals eşikleri
        </summary>
        <DataGrid caption="Web Vitals eşikleri" head={['Metrik', 'Anlamı', 'İyi', 'Zayıf']} className="mt-3">
          {(Object.keys(VITAL_META) as Array<keyof typeof VITAL_META>).map((k) => (
            <tr key={k}>
              <td className="px-3 py-2 font-medium">{k}</td>
              <td className="px-3 py-2 text-right text-fg-muted">{VITAL_META[k].description}</td>
              <td className="px-3 py-2 text-right tabular-nums">≤ {fmtVital(k, VITAL_META[k].good)}</td>
              <td className="px-3 py-2 text-right tabular-nums">&gt; {fmtVital(k, VITAL_META[k].poor)}</td>
            </tr>
          ))}
        </DataGrid>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <a className="inline-flex min-h-11 items-center gap-1 rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="https://web.dev/articles/vitals" target="_blank" rel="noopener noreferrer">
            web.dev: Web Vitals <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(yeni sekmede açılır)</span>
          </a>
          <a className="inline-flex min-h-11 items-center gap-1 rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="https://vercel.com/docs/speed-insights" target="_blank" rel="noopener noreferrer">
            Vercel Speed Insights <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(yeni sekmede açılır)</span>
          </a>
        </div>
      </details>
    </div>
  );
}
