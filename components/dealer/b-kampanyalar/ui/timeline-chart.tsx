'use client';

/**
 * Gönderim öncesi/sonrası günlük ziyaret çubukları — recharts YALNIZ bu dosyada (lazyChart).
 * Gönderim günü dikey çizgiyle işaretli; gönderim öncesi çubuklar soluk (aynı veri, renk + konum).
 */
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartToneColor } from '@/components/ds/data/chart-theme';

export type TimelineChartRow = { label: string; offset: number; visitors: number };

export default function TimelineChart({
  data,
  sendLabel,
  visitorsLabel,
}: {
  data: readonly TimelineChartRow[];
  sendLabel: string;
  visitorsLabel: string;
}) {
  const sendRow = data.find((d) => d.offset === 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis dataKey="label" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={40} />
        <Tooltip
          contentStyle={CHART_THEME.tooltipStyle}
          cursor={{ fill: CHART_THEME.cursor }}
          formatter={(value: number) => [value, visitorsLabel]}
        />
        {sendRow && (
          <ReferenceLine
            x={sendRow.label}
            stroke={CHART_THEME.reference}
            strokeDasharray="4 4"
            label={{ value: sendLabel, position: 'top', fill: CHART_THEME.axisLabel, fontSize: 12 }}
          />
        )}
        <Bar dataKey="visitors" isAnimationActive={false} radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.offset < 0 ? chartToneColor('neutral', 0.35) : chartToneColor('brand')} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
