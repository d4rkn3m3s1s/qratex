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

const DEFAULT_COLOR = 'hsl(var(--primary))';

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
          {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />}
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            width={28}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--card))',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
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
