'use client';

/**
 * Kıyas eğilimi — recharts YALNIZ bu dosyada (sayfa `lazyChart` ile ayrı parça yükler).
 * Gölge alan = akranların orta yarısı (p25–p75), kesikli çizgi = akran medyanı, düz çizgi = siz.
 * Boş kova boşluk kalır (0'a çakılmaz, denetim B3); o kovada < 3 değerlendirme olan nokta soluk.
 * Ops kaydı: animasyon kapalı. Grafik `aria-hidden` (ChartFrame tablo karşılığını verir).
 */
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartSeriesColor, chartToneColor } from '@/components/ds/data/chart-theme';
import type { SeriesMetricKey, SeriesPoint } from '@/lib/dealer-benchmark/types';
import { useBkCopy } from './copy';
import { fmtDay, fmtUnit } from './format';

const MIN_N = 3;

export default function BenchTrendChart({ data, metric, bucket }: { data: SeriesPoint[]; metric: SeriesMetricKey; bucket: 'day' | 'week' }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.trend;
  const unit = metric === 'rating' ? 'rating' : 'percent';
  const rows = data.map((p) => ({ ...p, band: p.peerP25 != null && p.peerP75 != null ? [p.peerP25, p.peerP75] : null }));
  const domain: [number, number] = metric === 'rating' ? [1, 5] : [0, 100];
  const interval = rows.length > 14 ? Math.ceil(rows.length / 7) - 1 : 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis
          dataKey="start"
          tick={CHART_THEME.tick}
          stroke={CHART_THEME.grid}
          interval={interval}
          minTickGap={8}
          tickFormatter={(d) => fmtDay(String(d), locale)}
        />
        <YAxis domain={domain} tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={40} ticks={metric === 'rating' ? [1, 2, 3, 4, 5] : undefined} />
        <Tooltip
          contentStyle={CHART_THEME.tooltipStyle}
          labelStyle={CHART_THEME.tooltipLabelStyle}
          itemStyle={CHART_THEME.tooltipItemStyle}
          cursor={{ stroke: CHART_THEME.cursor }}
          labelFormatter={(d) => (bucket === 'week' ? `${c.colStart}: ${fmtDay(String(d), locale)}` : fmtDay(String(d), locale, { weekday: 'short', day: 'numeric', month: 'short' }))}
          formatter={(value, name) => {
            if (value == null) return ['—', name];
            if (Array.isArray(value)) return [`${fmtUnit(Number(value[0]), unit, locale)} – ${fmtUnit(Number(value[1]), unit, locale)}`, name];
            return [fmtUnit(Number(value), unit, locale), name];
          }}
        />
        <Area dataKey="band" name={c.colBand} stroke="none" fill={chartToneColor('neutral', 0.18)} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="peerP50" name={c.colP50} stroke={chartToneColor('neutral')} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line
          dataKey="you"
          name={c.colYou}
          stroke={chartSeriesColor(0)}
          strokeWidth={2}
          isAnimationActive={false}
          connectNulls={false}
          dot={(props: { cx?: number; cy?: number; payload?: SeriesPoint; index?: number }) => {
            const { cx, cy, payload, index } = props;
            if (cx == null || cy == null || payload?.you == null) return <g key={`d-${index}`} />;
            const faint = payload.n < MIN_N;
            return <circle key={`d-${index}`} cx={cx} cy={cy} r={3.5} fill={chartSeriesColor(0, faint ? 0.3 : 1)} stroke="none" />;
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
