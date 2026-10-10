'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartToneColor } from '@/components/ds/data/chart-theme';

export type TrendPoint = { day: string; label: string; n: number };

/**
 * Günlük yanıt çubuk grafiği — `lazyChart` ile ayrı parça; `ChartFrame` içinde `aria-hidden`
 * çizilir (aynı veri erişilebilir tablo olarak da var). Renkler rol token'larından.
 */
export default function SurveyTrendChart({ data, countLabel }: { data: TrendPoint[]; countLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART_THEME.grid} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_THEME.axis }} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          cursor={{ fill: CHART_THEME.cursor }}
          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 8, color: CHART_THEME.tooltipText }}
          formatter={(value: number) => [value, countLabel]}
        />
        <Bar dataKey="n" fill={chartToneColor('brand')} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
