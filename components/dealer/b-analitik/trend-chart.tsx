'use client';

/**
 * Eğilim grafiği — recharts YALNIZ bu dosyada (sayfa `lazyChart` ile ayrı parça yükler).
 * Sütun = günlük adet, çizgi = ortalama puan (ikinci eksen, kaydı olmayan günde boşluk),
 * kesikli çizgi = önceki dönem adedi. Olağan dışı günler tehlike tonuyla işaretlenir.
 * Ops kaydı: animasyon kapalı. Grafik `aria-hidden` (ChartFrame tablo karşılığını verir).
 */
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartEnter } from "@/components/ds/data/use-chart-enter";
import { CHART_THEME, chartSeriesColor, chartToneColor } from '@/components/ds/data/chart-theme';
import type { SeriesPoint } from '@/lib/dealer-analytics/types';
import { dayLabel, formatNumber, formatRating, useAnalyticsCopy, useAnalyticsLocale } from './copy';

export type TrendView = 'volume' | 'sentiment';

export default function TrendChart({ data, view, anomalyDays, showCompare }: { data: SeriesPoint[]; view: TrendView; anomalyDays: string[]; showCompare: boolean }) {
  const enter = useChartEnter();
  const locale = useAnalyticsLocale();
  const copy = useAnalyticsCopy();
  const anomalies = new Set(anomalyDays);
  const tickInterval = data.length > 60 ? Math.ceil(data.length / 10) : data.length > 14 ? Math.ceil(data.length / 7) - 1 : 0;

  const tooltip = (
    <Tooltip
      contentStyle={CHART_THEME.tooltipStyle}
          labelStyle={CHART_THEME.tooltipLabelStyle}
          itemStyle={CHART_THEME.tooltipItemStyle}
      cursor={{ fill: CHART_THEME.cursor }}
      labelFormatter={(d) => dayLabel(String(d), locale, { weekday: 'short', day: 'numeric', month: 'short' })}
      formatter={(value, name) => {
        if (value == null) return ['—', name];
        const n = Number(value);
        return [name === copy.colAvg ? formatRating(n, locale) : formatNumber(n, locale), name];
      }}
    />
  );

  if (view === 'sentiment') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
          <XAxis dataKey="day" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} interval={tickInterval} tickFormatter={(d) => dayLabel(String(d), locale)} minTickGap={8} />
          <YAxis tick={CHART_THEME.tick} stroke={CHART_THEME.grid} allowDecimals={false} width={40} />
          {tooltip}
          <Legend wrapperStyle={CHART_THEME.legendStyle} />
          <Bar dataKey="positive" name={copy.colPositive} stackId="s" fill={chartToneColor('success')} {...enter} />
          <Bar dataKey="neutral" name={copy.colNeutral} stackId="s" fill={chartToneColor('neutral', 0.55)} {...enter} />
          <Bar dataKey="negative" name={copy.colNegative} stackId="s" fill={chartToneColor('danger')} {...enter} />
          <Bar dataKey="pending" name={copy.colPending} stackId="s" fill={chartToneColor('info', 0.45)} {...enter} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis dataKey="day" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} interval={tickInterval} tickFormatter={(d) => dayLabel(String(d), locale)} minTickGap={8} />
        <YAxis yAxisId="count" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} allowDecimals={false} width={40} />
        <YAxis yAxisId="rating" orientation="right" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={28} />
        {tooltip}
        <Legend wrapperStyle={CHART_THEME.legendStyle} />
        <Bar yAxisId="count" dataKey="count" name={copy.colCount} fill={chartSeriesColor(0, 0.75)} radius={CHART_THEME.barRadius} {...enter}>
          {data.map((p) => (
            <Cell key={p.day} fill={anomalies.has(p.day) ? chartToneColor('danger', 0.85) : chartSeriesColor(0, 0.75)} />
          ))}
        </Bar>
        {showCompare && (
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="compareCount"
            name={copy.compareSeries}
            stroke={chartToneColor('neutral')}
            strokeDasharray="4 4"
            dot={false}
            {...enter}
          />
        )}
        <Line
          yAxisId="rating"
          type="monotone"
          dataKey="avgRating"
          name={copy.colAvg}
          stroke={chartToneColor('warning')}
          strokeWidth={2}
          dot={data.length <= 31 ? { r: 2.5 } : false}
          connectNulls={false}
          {...enter}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
