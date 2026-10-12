'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartEnter } from "@/components/ds/data/use-chart-enter";
import { CHART_THEME, chartToneColor } from '@/components/ds/data/chart-theme';

export type TrendPoint = { day: string; label: string; n: number };

/**
 * Günlük yanıt çubuk grafiği — `lazyChart` ile ayrı parça; `ChartFrame` içinde `aria-hidden`
 * çizilir (aynı veri erişilebilir tablo olarak da var). Eksen/ipucu/köşe yarıçapı diğer bayi grafikleriyle aynı `CHART_THEME`'den (tek grafik teması).
 */
export default function SurveyTrendChart({ data, countLabel }: { data: TrendPoint[]; countLabel: string }) {
  const enter = useChartEnter();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART_THEME.grid} />
        <XAxis dataKey="label" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={40} />
        <Tooltip
          cursor={{ fill: CHART_THEME.cursor }}
          contentStyle={CHART_THEME.tooltipStyle}
          labelStyle={CHART_THEME.tooltipLabelStyle}
          itemStyle={CHART_THEME.tooltipItemStyle}
          formatter={(value: number) => [value, countLabel]}
        />
        <Bar dataKey="n" fill={chartToneColor('brand')} radius={CHART_THEME.barRadius} {...enter} />
      </BarChart>
    </ResponsiveContainer>
  );
}
