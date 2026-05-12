'use client';

import {
  AreaChart,
  Area,
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

export type RoiWeeklyPoint = {
  weekLabel: string;
  weekStart: string;
  feedbacks: number;
  replied: number;
  avgRating: number;
  actionsDone: number;
};

export type RoiDailyPoint = {
  date: string;
  label: string;
  feedbacks: number;
  replied: number;
  avgRating: number;
};

export function RoiWeeklyAreaChart({ data }: { data: RoiWeeklyPoint[] }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorFeedbacks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_HEX.emerald} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_HEX.emerald} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_BRAND} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_BRAND} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorActions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_HEX.amber} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_HEX.amber} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="weekLabel" tick={{ fontSize: 12 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
            formatter={(value: number, name: string) => [
              name === 'avgRating' ? `${value} / 5` : value,
              name === 'feedbacks' ? 'Geri bildirim' : name === 'replied' ? 'Yanıtlanan' : name === 'avgRating' ? 'Ort. puan' : 'Aksiyon',
            ]}
            labelFormatter={(label) => `Hafta: ${label}`}
          />
          <Legend
            formatter={(value) =>
              value === 'feedbacks'
                ? 'Geri bildirim'
                : value === 'replied'
                  ? 'Yanıtlanan'
                  : value === 'avgRating'
                    ? 'Ort. puan'
                    : 'Aksiyon tamamlanan'
            }
          />
          <Area type="monotone" dataKey="feedbacks" stroke={CHART_HEX.emerald} fill="url(#colorFeedbacks)" strokeWidth={2} name="feedbacks" />
          <Area type="monotone" dataKey="replied" stroke={CHART_BRAND} fill="url(#colorReplied)" strokeWidth={2} name="replied" />
          <Area type="monotone" dataKey="actionsDone" stroke={CHART_HEX.amber} fill="url(#colorActions)" strokeWidth={2} name="actionsDone" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RoiDailyBarChart({ data }: { data: RoiDailyPoint[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
            formatter={(value: number, name: string) => [value, name === 'feedbacks' ? 'Geri bildirim' : 'Yanıtlanan']}
          />
          <Bar dataKey="feedbacks" fill={CHART_HEX.emerald} radius={[4, 4, 0, 0]} name="feedbacks" />
          <Bar dataKey="replied" fill={CHART_BRAND} radius={[4, 4, 0, 0]} name="replied" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
