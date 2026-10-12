"use client";

/**
 * Günlük değerlendirme grafiği — recharts YALNIZ bu dosyada (`lazyChart` ile ayrı parça).
 * Üstte adet (sütun), altta ortalama puan (ayrı küçük grafik, tek eksen; kaydı olmayan günde boşluk), kesikli çizgi =
 * karşılaştırma dönemi. Eksenler ve ızgara var (rapor B-13). Ops kaydı: animasyon kapalı
 * (365 animasyonlu sütun yok — B-28). Grafik `aria-hidden`; ChartFrame erişilebilir tabloyu verir.
 */
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_THEME,
  chartSeriesColor,
  chartToneColor,
} from "@/components/ds/data/chart-theme";
import type { OverviewSeriesPoint } from "@/lib/admin-analytics/types";
import {
  dayLabel,
  fmtNumber,
  fmtRating,
  useAdminAnalyticsCopy,
  useAdminAnalyticsLocale,
} from "./copy";

export default function AdminTrendChart({
  data,
  showCompare,
}: {
  data: OverviewSeriesPoint[];
  showCompare: boolean;
}) {
  const locale = useAdminAnalyticsLocale();
  const copy = useAdminAnalyticsCopy();
  const tickInterval =
    data.length > 60
      ? Math.ceil(data.length / 10)
      : data.length > 14
        ? Math.ceil(data.length / 7) - 1
        : 0;
  const xAxis = (hideTicks: boolean) => (
    <XAxis
      dataKey="day"
      tick={hideTicks ? false : CHART_THEME.tick}
      height={hideTicks ? 4 : 30}
      stroke={CHART_THEME.grid}
      interval={tickInterval}
      tickFormatter={(d) => dayLabel(String(d), locale)}
      minTickGap={8}
    />
  );
  const tooltip = (
    <Tooltip
      contentStyle={CHART_THEME.tooltipStyle}
      labelStyle={CHART_THEME.tooltipLabelStyle}
      itemStyle={CHART_THEME.tooltipItemStyle}
      cursor={{ fill: CHART_THEME.cursor }}
      labelFormatter={(d) =>
        dayLabel(String(d), locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      }
      formatter={(value, name) => {
        if (value == null) return ["—", name];
        const n = Number(value);
        return [
          name === copy.colAvg ? fmtRating(n, locale) : fmtNumber(n, locale),
          name,
        ];
      }}
    />
  );
  const margin = { top: 4, right: 8, bottom: 0, left: -12 };
  // Çift Y ekseni yerine iki küçük grafik (small multiples): ortak X, senkron tooltip (syncId).
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">
        {copy.colReviews}
      </p>
      <div className="min-h-0 flex-[1.2]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={margin} syncId="admin-trend">
            <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
            {xAxis(true)}
            <YAxis
              tick={CHART_THEME.tick}
              stroke={CHART_THEME.grid}
              allowDecimals={false}
              width={40}
            />
            {tooltip}
            {showCompare && <Legend wrapperStyle={CHART_THEME.legendStyle} />}
            <Bar
              dataKey="reviews"
              name={copy.colReviews}
              fill={chartSeriesColor(0, 0.75)}
              radius={CHART_THEME.barRadius}
              isAnimationActive={false}
            />
            {showCompare && (
              <Line
                type="monotone"
                dataKey="compareReviews"
                name={copy.colCompare}
                stroke={chartToneColor("neutral")}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        {copy.colAvg} (1–5)
      </p>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={margin} syncId="admin-trend">
            <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
            {xAxis(false)}
            <YAxis
              domain={[1, 5]}
              ticks={[1, 3, 5]}
              tick={CHART_THEME.tick}
              stroke={CHART_THEME.grid}
              width={40}
            />
            {tooltip}
            <Line
              type="monotone"
              dataKey="avgRating"
              name={copy.colAvg}
              stroke={chartSeriesColor(1)}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
