'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_BRAND, CHART_HEX } from '@/lib/chart-palette';

export type CopilotDailyPoint = {
  date: string;
  label: string;
  total: number;
  negative: number;
  avgRating: number;
};

export function CopilotDailyTrendChart({ data }: { data: CopilotDailyPoint[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
            formatter={(value: number, name: string) => [value, name === 'total' ? 'Toplam' : 'Negatif']}
            labelFormatter={(label) => `Gün: ${label}`}
          />
          <Legend formatter={(v) => (v === 'total' ? 'Toplam geri bildirim' : 'Negatif')} />
          <Bar dataKey="total" fill={CHART_BRAND} radius={[4, 4, 0, 0]} name="total" />
          <Bar dataKey="negative" fill={CHART_HEX.amber} radius={[4, 4, 0, 0]} name="negative" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
