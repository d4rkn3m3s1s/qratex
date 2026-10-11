'use client';

import { AlertTriangle, Flame, Inbox, ShieldAlert, Activity, Gauge, Timer, Coins, Cpu } from 'lucide-react';
import { ChartFrame, MetricGrid, MetricTile, StatusBadge, lazyChart } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import { HEALTH_META, deltaPct, type UsageReport } from '@/lib/admin-ai-ops/contract';
import { useAiOps, useBacklog, useBudget, useSignals, useUsage } from './hooks';
import { AttentionTile, Meter, budgetTone, bucketLabel, fmtAgo, fmtCompact, fmtInt, fmtMs, fmtPct } from './parts';
import { AdminAiOperasyonText } from './copy';

const UsageChart = lazyChart(() => import('./usage-chart'));

export function UsageKpis({ u }: { u: UsageReport }) {
  const t = u.totals;
  const p = u.previous;
  const tokens = t.inputTokens + t.outputTokens;
  const prevTokens = p.inputTokens + p.outputTokens;
  const d = (cur: number | null, prev: number | null, good: 'up' | 'down' | 'neutral' = 'neutral') => {
    const v = deltaPct(cur, prev);
    return v == null ? null : { value: v, goodDirection: good };
  };
  return (
    <MetricGrid cols={5}>
      <MetricTile label="AI çağrısı" icon={<Activity />} metric={{ value: t.calls, delta: d(t.calls, p.calls), series: u.series.map((s) => s.calls) }} sparklineLabel="Dönem içindeki çağrı eğilimi" />
      <MetricTile
        label="Hata oranı"
        icon={<AlertTriangle />}
        tone={t.errorRate != null && t.errorRate > 5 ? 'danger' : 'neutral'}
        metric={{ value: t.errorRate, format: 'percent', delta: t.errorRate != null && p.errorRate != null ? { value: Math.round((t.errorRate - p.errorRate) * 10) / 10, kind: 'points', goodDirection: 'down' } : null, n: t.calls, minN: 20 }}
        hint={`${fmtInt(t.failures)} başarısız çağrı`}
      />
      <MetricTile label="p95 gecikme" icon={<Timer />} metric={{ value: t.p95Ms, format: 'duration', durationUnit: 'ms', delta: d(t.p95Ms, p.p95Ms, 'down') }} hint={`p50 ${fmtMs(t.p50Ms)} · yalnız başarılı çağrılar`} />
      <MetricTile label="Token" icon={<Coins />} metric={{ value: tokens, compact: true, delta: d(tokens, prevTokens) }} hint={`Girdi ${fmtCompact(t.inputTokens)} · çıktı ${fmtCompact(t.outputTokens)}`} />
      <MetricTile
        label="Yerel yedek"
        icon={<Cpu />}
        metric={{ value: t.calls ? Math.round((t.fallbackCalls / t.calls) * 1000) / 10 : null, format: 'percent', n: t.calls, minN: 20 }}
        hint="Sağlayıcı yanıt vermediğinde kural tabanlı analiz"
      />
    </MetricGrid>
  );
}

export function UsageSeries({ u, height = 240 }: { u: UsageReport; height?: number }) {
  const total = u.totals.calls;
  return (
    <ChartFrame
      title="Çağrı ve hata zaman serisi"
      description={u.bucket === 'hour' ? 'Saatlik, İstanbul saati' : 'Günlük, İstanbul günü'}
      data={total === 0 ? [] : u.series}
      columns={[
        { key: 'at', label: 'Zaman', format: (v) => bucketLabel(String(v)) },
        { key: 'calls', label: 'Çağrı', numeric: true, format: (v) => fmtInt(Number(v)) },
        { key: 'failures', label: 'Başarısız', numeric: true, format: (v) => fmtInt(Number(v)) },
        { key: 'tokens', label: 'Token', numeric: true, format: (v) => fmtInt(Number(v)) },
      ]}
      height={height}
      summary={`Dönemde ${fmtInt(total)} çağrı, ${fmtInt(u.totals.failures)} başarısız.`}
      empty={{ title: 'Bu dönemde AI çağrısı yok', description: 'Kayıtlar kalıcı kullanım günlüğünden okunur; çağrı olduğunda burada görünür.' }}
    >
      <UsageChart data={u.series} />
    </ChartFrame>
  );
}

export function OverviewTab() {
  const { openSignal, goTab } = useAiOps();
  const usage = useUsage();
  const signals = useSignals();
  const backlog = useBacklog();
  const budget = useBudget();

  return (
    <div className="space-y-6">
      <SectionCard
        title="AI motoru"
        description="Kalıcı kullanım kaydından (başarısız çağrılar dahil). Çağrı yoksa sağlık uydurulmaz."
        icon={<Gauge />}
        actions={
          usage.data ? (
            <StatusBadge label={HEALTH_META[usage.data.health].label} tone={HEALTH_META[usage.data.health].tone} srPrefix="Durum" />
          ) : null
        }
      >
        <QueryState query={usage} skeleton="stats">
          {(u) => (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                Sağlayıcı: <span className="font-medium text-fg">{u.provider.configured ? `${u.provider.provider}${u.provider.model ? ` · ${u.provider.model}` : ''}` : 'yapılandırılmamış'}</span>
              </p>
              <UsageKpis u={u} />
            </div>
          )}
        </QueryState>
      </SectionCard>

      <section aria-labelledby="ai-attention-h">
        <h2 id="ai-attention-h" className="mb-3 text-base font-semibold text-fg">
          Dikkat gerektiren
        </h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <QueryState query={signals} skeleton="cards" className="col-span-full xl:col-span-3">
            {(s) => (
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
                <AttentionTile label="Yüksek aciliyet" icon={<Flame />} tone="danger" value={s.attention.urgent} prev={s.attention.prev.urgent} hint="Aciliyeti yüksek ya da kritik" onClick={() => openSignal({ signal: 'urgent' })} />
                <AttentionTile label="Kayıp riski" icon={<AlertTriangle />} tone="warning" value={s.attention.churnHigh} prev={s.attention.prev.churnHigh} hint="Kayıp riski yüksek müşteri" onClick={() => openSignal({ signal: 'churn' })} />
                <AttentionTile label="Toksik" icon={<ShieldAlert />} tone="danger" value={s.attention.toxic} prev={s.attention.prev.toxic} hint="Toksik işaretli yorum" onClick={() => openSignal({ signal: 'toxic' })} />
              </div>
            )}
          </QueryState>
          <QueryState query={backlog} skeleton="cards">
            {(b) => (
              <AttentionTile
                label="Analiz kuyruğu"
                icon={<Inbox />}
                tone="warning"
                value={b.eligible + b.exhausted}
                hint={b.oldestEligibleAt ? `En eski bekleyen ${fmtAgo(b.oldestEligibleAt)}` : `${fmtInt(b.exhausted)} kaydın hakkı bitti`}
                onClick={() => goTab('kuyruk')}
                actionLabel="Kuyruk sekmesine git"
              />
            )}
          </QueryState>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <QueryState query={usage} skeleton="block">
            {(u) => <UsageSeries u={u} />}
          </QueryState>
        </div>
        <SectionCard title="Bugünkü bütçe" description="Muhafızın gün sınırı UTC gece yarısı (İstanbul 03:00)." icon={<Coins />}>
          <QueryState query={budget} skeleton="list">
            {(b) => (
              <div className="space-y-4">
                {b.platform.map((g) => (
                  <div key={g.key}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-fg">{g.label}</span>
                      <span className="tabular-nums text-fg-muted">
                        {fmtCompact(g.used)} / {fmtCompact(g.limit)} · {fmtPct(g.percent)}
                      </span>
                    </div>
                    <Meter value={g.percent} tone={budgetTone(g.percent)} label={`${g.label}: günlük tavanın ${fmtPct(g.percent)} kadarı kullanıldı`} className="mt-1.5" />
                  </div>
                ))}
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium text-fg"><AdminAiOperasyonText k="topSpenders" /></p>
                  <p className="text-xs text-fg-muted">Bayi başı günlük tavan {fmtCompact(b.dealerLimit)} token</p>
                  {b.topDealers.length === 0 ? (
                    <p className="mt-2 text-sm text-fg-muted"><AdminAiOperasyonText k="noCallsToday" /></p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {b.topDealers.map((d) => (
                        <li key={d.dealerId}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate text-fg">{d.name}</span>
                            <span className="shrink-0 tabular-nums text-fg-muted">{fmtPct(d.percent)}</span>
                          </div>
                          <Meter value={d.percent} tone={budgetTone(d.percent)} label={`${d.name}: günlük kotanın ${fmtPct(d.percent)} kadarı`} className="mt-1" />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </QueryState>
        </SectionCard>
      </div>
    </div>
  );
}
