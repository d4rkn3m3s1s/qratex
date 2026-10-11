'use client';

/** recharts YALNIZ bu dosyada — `lazyChart` ile ayrı parça olarak yüklenir. */
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartToneColor } from '@/components/ds/data/chart-theme';
import type { SeriesPoint } from '@/lib/admin-ai-ops/contract';
import { bucketLabel } from './parts';

export default function UsageChart({ data }: { data: SeriesPoint[] }) {
  const rows = data.map((d) => ({ ...d, ok: Math.max(0, d.calls - d.failures), label: bucketLabel(d.at) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis dataKey="label" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} minTickGap={16} />
        <YAxis yAxisId="c" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} allowDecimals={false} />
        <Tooltip contentStyle={CHART_THEME.tooltipStyle} cursor={{ fill: CHART_THEME.cursor }} />
        <Bar yAxisId="c" dataKey="ok" name="Başarılı çağrı" stackId="a" fill={chartToneColor('info', 0.75)} isAnimationActive={false} />
        <Bar yAxisId="c" dataKey="failures" name="Başarısız çağrı" stackId="a" fill={chartToneColor('danger', 0.85)} isAnimationActive={false} />
        <Line yAxisId="c" type="monotone" dataKey="calls" name="Toplam" stroke={chartToneColor('brand')} dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
