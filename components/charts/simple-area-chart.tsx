'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_THEME, chartSeriesColor } from '@/components/ds/data/chart-theme';

export interface SimpleAreaChartDatum {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface SimpleAreaChartProps {
  data: SimpleAreaChartDatum[];
  dataKey?: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  gradientId?: string;
}

const DEFAULT_COLOR = chartSeriesColor(0);

export function SimpleAreaChart({
  data,
  dataKey = 'value',
  color = DEFAULT_COLOR,
  height = 180,
  showGrid = true,
  gradientId = 'area-gradient',
}: SimpleAreaChartProps) {
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
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
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
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={CHART_THEME.tooltipStyle}
            labelStyle={CHART_THEME.tooltipLabelStyle}
            itemStyle={CHART_THEME.tooltipItemStyle}
            formatter={(value: number) => [Number(value).toFixed(1), 'Değer']}
            labelFormatter={(label) => label}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
