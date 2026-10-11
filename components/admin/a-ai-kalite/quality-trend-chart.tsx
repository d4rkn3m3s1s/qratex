'use client';

// recharts YALNIZ bu dosyada (ChartFrame + lazyChart ile tembel yüklenir).
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartSeriesColor } from '@/components/ds/data/chart-theme';
import { QUALITY_ALERT_THRESHOLD } from '@/lib/ai-quality/contract';

export type TrendRow = { label: string; avg: number | null; n: number };

export default function QualityTrendChart({ data }: { data: TrendRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis dataKey="label" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={44} tickFormatter={(v: number) => `%${v}`} />
        <Tooltip
          contentStyle={CHART_THEME.tooltipStyle}
          formatter={(v: number, _n, item) => [`%${v} (${(item?.payload as TrendRow | undefined)?.n ?? 0} örnek)`, 'Ortalama doğruluk']}
        />
        <ReferenceLine y={QUALITY_ALERT_THRESHOLD} stroke={CHART_THEME.grid} strokeDasharray="4 4" />
        <Line type="monotone" dataKey="avg" stroke={chartSeriesColor(0)} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
