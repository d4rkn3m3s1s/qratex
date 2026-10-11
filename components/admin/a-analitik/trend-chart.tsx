'use client';

/**
 * Günlük değerlendirme grafiği — recharts YALNIZ bu dosyada (`lazyChart` ile ayrı parça).
 * Sütun = adet, çizgi = ortalama puan (sağ eksen; kaydı olmayan günde boşluk), kesikli çizgi =
 * karşılaştırma dönemi. Eksenler ve ızgara var (rapor B-13). Ops kaydı: animasyon kapalı
 * (365 animasyonlu sütun yok — B-28). Grafik `aria-hidden`; ChartFrame erişilebilir tabloyu verir.
 */
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartSeriesColor, chartToneColor } from '@/components/ds/data/chart-theme';
import type { OverviewSeriesPoint } from '@/lib/admin-analytics/types';
import { dayLabel, fmtNumber, fmtRating, useAdminAnalyticsCopy, useAdminAnalyticsLocale } from './copy';

export default function AdminTrendChart({ data, showCompare }: { data: OverviewSeriesPoint[]; showCompare: boolean }) {
  const locale = useAdminAnalyticsLocale();
  const copy = useAdminAnalyticsCopy();
  const tickInterval = data.length > 60 ? Math.ceil(data.length / 10) : data.length > 14 ? Math.ceil(data.length / 7) - 1 : 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis
          dataKey="day"
          tick={CHART_THEME.tick}
          stroke={CHART_THEME.grid}
          interval={tickInterval}
          tickFormatter={(d) => dayLabel(String(d), locale)}
          minTickGap={8}
        />
        <YAxis yAxisId="count" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} allowDecimals={false} width={40} />
        <YAxis yAxisId="rating" orientation="right" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={28} />
        <Tooltip
          contentStyle={CHART_THEME.tooltipStyle}
          cursor={{ fill: CHART_THEME.cursor }}
          labelFormatter={(d) => dayLabel(String(d), locale, { weekday: 'short', day: 'numeric', month: 'short' })}
          formatter={(value, name) => {
            if (value == null) return ['—', name];
            const n = Number(value);
            return [name === copy.colAvg ? fmtRating(n, locale) : fmtNumber(n, locale), name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="count" dataKey="reviews" name={copy.colReviews} fill={chartSeriesColor(0, 0.75)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        {showCompare && (
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="compareReviews"
            name={copy.colCompare}
            stroke={chartToneColor('neutral')}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        )}
        <Line
          yAxisId="rating"
          type="monotone"
          dataKey="avgRating"
          name={copy.colAvg}
          stroke={chartToneColor('warning')}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
