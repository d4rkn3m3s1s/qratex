'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_THEME, chartSeriesColor } from '@/components/ds/data/chart-theme';

export interface SimpleBarChartDatum {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface SimpleBarChartProps {
  data: SimpleBarChartDatum[];
  dataKey?: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  barRadius?: number;
}

const DEFAULT_COLOR = chartSeriesColor(0);

export function SimpleBarChart({
  data,
  dataKey = 'value',
  color = DEFAULT_COLOR,
  height = 200,
  showGrid = true,
  barRadius = 6,
}: SimpleBarChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        Veri yok
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {showGrid && <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />}
          <XAxis
            dataKey="name"
            tick={CHART_THEME.tick}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={CHART_THEME.tick}
            axisLine={false}
            tickLine={false}
            width={28}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
          />
          <Tooltip
            contentStyle={CHART_THEME.tooltipStyle}
            labelStyle={CHART_THEME.tooltipLabelStyle}
            itemStyle={CHART_THEME.tooltipItemStyle}
            formatter={(value: number) => [value, 'Değer']}
            labelFormatter={(label) => label}
          />
          <Bar dataKey={dataKey} radius={[barRadius, barRadius, 0, 0]} fill={color} maxBarSize={48}>
            {data.map((_, i) => (
              <Cell key={i} fill={color} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
