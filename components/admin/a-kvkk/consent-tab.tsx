'use client';

/**
 * Rıza kanıtı — `ConsentRecord` (yalnız ekleme) istatistikleri. Oranlar KARARLAR içinde
 * hesaplanır (aynı kişi birden çok karar verebilir); farklı kişi/cihaz sayısı ayrıca verilir.
 */
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { EmptyState, QueryState, TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';
import { CONSENT_CATEGORY_LABELS } from '@/lib/consent/types';
import { CONSENT_WINDOWS, type ConsentStats, type ConsentWindow } from '@/lib/admin-privacy/contract';
import { fetchConsent } from './api';
import { formatDate, formatNumber, formatPercent } from './format';
import { AdminKvkkText } from './copy';

const SOURCE_LABELS: Record<string, string> = {
  banner: 'Çerez bandı',
  settings: 'Ayarlar',
  footer: 'Alt bilgi',
  policy: 'Politika sayfası',
  other: 'Diğer',
  api: 'API',
  bilinmiyor: 'Bilinmiyor',
};

function RateBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-fg">{label}</span>
        <span className="tabular-nums text-fg">{formatPercent(value)}</span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-label={`${label} onay oranı`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? 0}
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-base motion-reduce:transition-none" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function DailyBars({ daily }: { daily: ConsentStats['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <figure>
      <div className="flex h-28 items-end gap-[2px]" aria-hidden>
        {daily.map((d) => (
          <div
            key={d.day}
            title={`${formatDate(d.day)}: ${d.count}`}
            className="flex-1 rounded-t bg-brand/70"
            style={{ height: `${Math.max(d.count ? 4 : 0, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-fg-muted">
        <span>{formatDate(daily[0]?.day)}</span>
        <span>{formatDate(daily[daily.length - 1]?.day)}</span>
      </figcaption>
      <table className="sr-only">
        <caption><AdminKvkkText k="dailyConsent" /></caption>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function ConsentTab() {
  const [days, setDays] = useState<ConsentWindow>(30);
  const query = useQuery({
    queryKey: ['admin-privacy', 'consent', days],
    queryFn: () => fetchConsent(days),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Dönem" className="flex gap-1">
        {CONSENT_WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={days === w}
            onClick={() => setDays(w)}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
              days === w ? 'bg-brand-subtle font-medium text-brand' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
            )}
          >
            Son {w} gün
          </button>
        ))}
      </div>

      <QueryState
        query={query}
        skeleton="stats"
        isEmpty={(d) => d.decisions === 0}
        empty={
          <EmptyState
            title="Bu dönemde rıza kaydı yok"
            description="Çerez bandında verilen her karar burada kanıt olarak görünür. Kayıt gelmiyorsa bandın kayıt isteğini kontrol edin."
          />
        }
        error={{ title: 'Rıza istatistikleri yüklenemedi' }}
      >
        {(d) => (
          <div className={cn('flex flex-col gap-6 transition-opacity', query.isFetching && 'opacity-70')} aria-busy={query.isFetching}>
            <MetricGrid cols={4}>
              <MetricTile label="Karar" metric={{ value: d.decisions }} hint="Her karar ayrı kanıt satırı" />
              <MetricTile label="Farklı kişi/cihaz" metric={{ value: d.subjects }} hint={`${formatNumber(d.signedIn)} oturum açmış`} />
              <MetricTile
                label="Yalnız zorunluya izin"
                metric={{ value: d.rejectAllRate, format: 'percent' }}
                hint="Hiçbir isteğe bağlı kategoriye evet demeyen"
              />
              <MetricTile
                label={`Güncel sürüm (${d.currentVersion})`}
                metric={{ value: d.byVersion.find((v) => v.current)?.count ?? 0 }}
                hint="Eski sürüm rızaları geçersiz sayılır"
              />
            </MetricGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Kategori onay oranları" description="Kararlar içinde “evet” payı">
                <div className="space-y-4">
                  <RateBar label={CONSENT_CATEGORY_LABELS.analytics.title} value={d.rates.analytics} />
                  <RateBar label={CONSENT_CATEGORY_LABELS.replay.title} value={d.rates.replay} />
                  <RateBar label={CONSENT_CATEGORY_LABELS.marketing.title} value={d.rates.marketing} />
                </div>
              </SectionCard>
              <SectionCard title="Günlük kararlar" description="Europe/Istanbul günleri">
                <DailyBars daily={d.daily} />
              </SectionCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Sürüme göre" density="flush">
                <ul className="divide-y divide-border">
                  {d.byVersion.map((v) => (
                    <li key={v.version} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="text-fg">
                        Sürüm {v.version}
                        {v.current ? <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs', TONE_CHIP.success)}><AdminKvkkText k="current" /></span> : null}
                      </span>
                      <span className="tabular-nums text-fg">{formatNumber(v.count)}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
              <SectionCard title="Kaynağa göre" density="flush">
                <ul className="divide-y divide-border">
                  {d.bySource.map((s) => (
                    <li key={s.source} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="text-fg">{SOURCE_LABELS[s.source] ?? s.source}</span>
                      <span className="tabular-nums text-fg">{formatNumber(s.count)}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
