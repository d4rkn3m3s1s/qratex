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
  AreaChart,
  Area,
  ComposedChart,
  Line,
} from 'recharts';
import { CHART_BRAND, CHART_HEX } from '@/lib/chart-palette';

export type BenchmarkWeeklyPoint = {
  weekLabel: string;
  dealerRating: number;
  platformRating: number;
  dealerReplyRate: number;
  platformReplyRate: number;
};

export type BenchmarkDailyPoint = { date: string; label: string; dealerRating: number; platformRating: number };

export type BenchmarkComparisonRow = { name: string; siz: number; platform: number };

export function BenchmarkDailyAreaChart({ data }: { data: BenchmarkDailyPoint[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gDealerDaily" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_HEX.blue} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_HEX.blue} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gPlatformDaily" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_HEX.slateLight} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_HEX.slateLight} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
            formatter={(v: number, n: string) => [`${v} / 5`, n.includes('dealer') ? 'Siz' : 'Platform']}
          />
          <Legend formatter={(v) => (v === 'dealerRating' ? 'Sizin puan' : 'Platform puan')} />
          <Area type="monotone" dataKey="dealerRating" stroke={CHART_HEX.blue} fill="url(#gDealerDaily)" strokeWidth={2} name="dealerRating" />
          <Area type="monotone" dataKey="platformRating" stroke={CHART_HEX.slateLight} fill="url(#gPlatformDaily)" strokeWidth={2} name="platformRating" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BenchmarkComparisonBars({ data }: { data: BenchmarkComparisonRow[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 100, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
            formatter={(v: number, n: string) => [v, n === 'siz' ? 'Siz' : 'Platform']}
          />
          <Legend formatter={(v) => (v === 'siz' ? 'Sizin metrikleriniz' : 'Platform ortalaması')} />
          <Bar dataKey="siz" fill={CHART_HEX.blue} radius={[0, 4, 4, 0]} name="siz" />
          <Bar dataKey="platform" fill={CHART_HEX.slateLight} radius={[0, 4, 4, 0]} name="platform" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BenchmarkWeeklyComposedChart({ data }: { data: BenchmarkWeeklyPoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorDealerRating" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_HEX.blue} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_HEX.blue} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorPlatformRating" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_HEX.slateLight} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_HEX.slateLight} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" domain={[0, 5]} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
            formatter={(v: number, n: string) => [n.includes('Rating') ? `${v} / 5` : `${v}%`, n.includes('dealer') ? 'Siz' : 'Platform']}
          />
          <Legend
            formatter={(v) =>
              v === 'dealerRating'
                ? 'Sizin puan'
                : v === 'platformRating'
                  ? 'Platform puan'
                  : v === 'dealerReplyRate'
                    ? 'Sizin yanıt'
                    : 'Platform yanıt'
            }
          />
          <Area type="monotone" dataKey="dealerRating" stroke={CHART_HEX.blue} fill="url(#colorDealerRating)" strokeWidth={2} yAxisId="left" name="dealerRating" />
          <Area type="monotone" dataKey="platformRating" stroke={CHART_HEX.slateLight} fill="url(#colorPlatformRating)" strokeWidth={2} yAxisId="left" name="platformRating" />
          <Line type="monotone" dataKey="dealerReplyRate" stroke={CHART_BRAND} strokeWidth={2} dot={{ r: 4 }} yAxisId="right" name="dealerReplyRate" />
          <Line type="monotone" dataKey="platformReplyRate" stroke={CHART_HEX.slate} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} yAxisId="right" name="platformReplyRate" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
