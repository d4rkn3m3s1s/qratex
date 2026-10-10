'use client';

/**
 * Etki haftalık eğilimi — recharts YALNIZ bu dosyada (lazy parça). Eksen hafta başı tarihleri
 * (ROI #27: "Hafta 1…6" yok). Ortalama puan çizilir (ROI #26) ve boş hafta boşluk kalır.
 * Aksiyonlar tamamlanma tarihine göre kovalanır (ROI #2, sunucu). Animasyon kapalı.
 */
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_THEME, chartSeriesColor, chartToneColor } from '@/components/ds/data/chart-theme';
import type { TrendPoint } from '@/lib/dealer-impact/types';
import { useBkCopy } from './copy';
import { fmtDay, fmtMoney, fmtNumber, fmtRating } from './format';

export type ImpactTrendView = 'volume' | 'rating' | 'actions' | 'visits';

export default function ImpactTrendChart({ data, view }: { data: TrendPoint[]; view: ImpactTrendView }) {
  const { copy, locale } = useBkCopy();
  const c = copy.impact.trend;
  const interval = data.length > 14 ? Math.ceil(data.length / 8) - 1 : 0;
  const axis = (
    <XAxis dataKey="week" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} interval={interval} minTickGap={8} tickFormatter={(d) => fmtDay(String(d), locale)} />
  );
  const tooltip = (
    <Tooltip
      contentStyle={CHART_THEME.tooltipStyle}
      cursor={{ fill: CHART_THEME.cursor }}
      labelFormatter={(d) => `${c.week}: ${fmtDay(String(d), locale, { day: 'numeric', month: 'short', year: 'numeric' })}`}
      formatter={(value, name) => {
        if (value == null) return ['—', name];
        const n = Number(value);
        if (name === c.avgRating) return [fmtRating(n, locale), name];
        if (name === c.revenue) return [fmtMoney(n, locale), name];
        return [fmtNumber(n, locale), name];
      }}
    />
  );
  const common = { margin: { top: 8, right: 8, bottom: 0, left: -12 } };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {view === 'volume' ? (
        <ComposedChart data={data} {...common}>
          <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
          {axis}
          <YAxis tick={CHART_THEME.tick} stroke={CHART_THEME.grid} allowDecimals={false} width={40} />
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="feedback" name={c.feedback} fill={chartSeriesColor(0, 0.75)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="replied" name={c.replied} fill={chartToneColor('success', 0.8)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line dataKey="negative" name={c.negative} stroke={chartToneColor('danger')} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      ) : view === 'rating' ? (
        <ComposedChart data={data} {...common}>
          <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
          {axis}
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={40} />
          {tooltip}
          <Line dataKey="avgRating" name={c.avgRating} stroke={chartSeriesColor(0)} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      ) : view === 'actions' ? (
        <ComposedChart data={data} {...common}>
          <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
          {axis}
          <YAxis tick={CHART_THEME.tick} stroke={CHART_THEME.grid} allowDecimals={false} width={40} />
          {tooltip}
          <Bar dataKey="actionsClosed" name={c.actionsClosed} fill={chartSeriesColor(2, 0.8)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </ComposedChart>
      ) : (
        <ComposedChart data={data} {...common}>
          <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
          {axis}
          <YAxis yAxisId="v" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} allowDecimals={false} width={40} />
          <YAxis yAxisId="r" orientation="right" tick={CHART_THEME.tick} stroke={CHART_THEME.grid} width={56} tickFormatter={(v) => fmtNumber(Number(v), locale)} />
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="v" dataKey="visits" name={c.visits} fill={chartSeriesColor(1, 0.75)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="r" dataKey="revenue" name={c.revenue} stroke={chartToneColor('success')} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      )}
    </ResponsiveContainer>
  );
}
