'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export interface DonutChartDatum {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartDatum[];
  size?: number;
  height?: number;
  innerRadiusPercent?: number;
  showLegend?: boolean;
}

export function DonutChart({
  data,
  size = 160,
  height = 200,
  innerRadiusPercent = 0.65,
  showLegend = true,
}: DonutChartProps) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        Veri yok
      </div>
    );
  }

  const total = filtered.reduce((a, d) => a + d.value, 0);
  const displayData = filtered.map((d) => ({ ...d, percent: total ? Math.round((d.value / total) * 100) : 0 }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={displayData}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.5 * innerRadiusPercent}
            outerRadius={size * 0.5 - 4}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            animationBegin={0}
            animationDuration={600}
          >
            {displayData.map((entry, index) => (
              <Cell key={entry.name ?? `cell-${index}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--card))',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            formatter={(value: number) => [`${value}%`, '']}
          />
          {showLegend && (
            <Legend
              layout="horizontal"
              align="center"
              verticalAlign="bottom"
              formatter={(value, entry) => (
                <span className="text-xs text-muted-foreground">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: (entry as { color?: string }).color }}
                  />
                  {value}
                </span>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
