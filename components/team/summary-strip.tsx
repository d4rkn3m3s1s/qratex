'use client';

import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, ListTodo, RefreshCcw } from 'lucide-react';
import { MetricGrid, MetricTile, Sparkline } from '@/components/ds/data';
import { InlineError } from '@/components/states';
import { formatMinutes } from '@/lib/team/dates';
import { weekKeyLabel } from '@/lib/team-week';
import { errorMessage } from './lib/api';
import type { TeamSummary } from './lib/types';

/**
 * Hafta özeti — sayılar sunucuda, FİLTRESİZ ve seçili haftaya göre (denetim Bulgu 43/44/15).
 * Grafik kütüphanesi yok: tek saf SVG eğilim çizgisi (eski sayfa 4 recharts grafiğini her
 * açılışta yüklüyordu; dağılım ve kişi yükü Rapor sekmesine taşındı).
 */
export function SummaryStrip({
  summary,
  loading,
  error,
  onOpenReview,
  showReview,
}: {
  summary: TeamSummary | undefined;
  loading: boolean;
  error: unknown;
  onOpenReview?: () => void;
  showReview: boolean;
}) {
  if (error && !summary) return <InlineError variant="banner">Özet yüklenemedi: {errorMessage(error)}</InlineError>;
  const w = summary?.week;
  const trend = summary?.trend ?? [];
  const label = summary ? (summary.isCurrentWeek ? 'Bu hafta' : weekKeyLabel(summary.weekKey)) : 'Hafta';
  const trendText = trend.length
    ? `Son ${trend.length} hafta tamamlanma: ${trend.map((t) => (t.pct === null ? '—' : `%${t.pct}`)).join(', ')}`
    : undefined;

  return (
    <section aria-label={`${label} özeti`} className="space-y-2">
      <MetricGrid cols={4}>
        <MetricTile
          label={`${label} · tamamlanma`}
          metric={{ value: w?.pct ?? null, format: 'percent', series: trend.map((t) => t.pct), n: w?.total }}
          loading={loading}
          icon={<CheckCircle2 />}
          tone="success"
          size="compact"
          sparklineLabel={trendText}
          hint={w ? `${w.done}/${w.total} görev bitti${w.carried ? ` · ${w.carried} devreden` : ''}` : undefined}
        />
        <MetricTile
          label="Devam eden"
          metric={{ value: w ? w.inProgress + w.todo : null }}
          loading={loading}
          icon={<CircleDashed />}
          size="compact"
          hint={w ? `${w.todo} başlanmadı · ${w.inProgress} devam` : undefined}
        />
        {showReview ? (
          <button type="button" onClick={onOpenReview} className="rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <MetricTile
              label="Onay bekleyen"
              metric={{ value: summary?.reviewQueue ?? null }}
              loading={loading}
              icon={<Clock3 />}
              tone="info"
              size="compact"
              hint="Tüm haftalar · kuyruğu aç"
            />
          </button>
        ) : (
          <MetricTile label="Onayda" metric={{ value: w?.review ?? null }} loading={loading} icon={<Clock3 />} tone="info" size="compact" />
        )}
        <MetricTile
          label="Geciken"
          metric={{ value: w?.overdue ?? null }}
          loading={loading}
          icon={<AlertTriangle />}
          tone={w && w.overdue > 0 ? 'danger' : 'neutral'}
          size="compact"
          hint={w && (w.spentMin || w.estimateMin) ? `Süre: ${formatMinutes(w.spentMin)} / ${formatMinutes(w.estimateMin)} tahmin` : undefined}
        />
      </MetricGrid>
      {trend.length > 1 && (
        <div className="flex items-center gap-3 rounded-card border border-subtle bg-surface-1 px-3 py-2">
          <span className="qx-caption flex shrink-0 items-center gap-1 text-fg-muted">
            <RefreshCcw className="h-3 w-3" aria-hidden /> {trend.length} haftalık tempo
          </span>
          <div className="h-8 min-w-0 flex-1">
            <Sparkline data={trend.map((t) => t.done)} tone="brand" height={32} area zeroBased showLast label={`Son ${trend.length} haftada biten görev: ${trend.map((t) => t.done).join(', ')}`} />
          </div>
          <span className="qx-caption qx-num shrink-0 text-fg-muted">
            <ListTodo className="mr-1 inline h-3 w-3" aria-hidden />
            {trend[trend.length - 1]?.done ?? 0} biten
          </span>
        </div>
      )}
    </section>
  );
}
