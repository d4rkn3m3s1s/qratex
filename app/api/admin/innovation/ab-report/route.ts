import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [impRaw, convRaw] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: {
        event: 'innovation_ab_impression',
        createdAt: { gte: since },
      },
      select: { data: true },
      take: 50_000,
    }),
    prisma.analyticsEvent.findMany({
      where: {
        event: 'innovation_ab_conversion',
        createdAt: { gte: since },
      },
      select: { data: true },
      take: 50_000,
    }),
  ]);

  type Cell = { impressions: number; conversions: number };
  const grid = new Map<string, Cell>();

  function cellKey(d: { experimentId?: string; variant?: string; dimension?: string }) {
    const dim = d.dimension?.trim() || '_';
    return `${d.experimentId}:${d.variant}:${dim}`;
  }

  function bump(rows: typeof impRaw, field: 'impressions' | 'conversions') {
    for (const r of rows) {
      const d = r.data as { experimentId?: string; variant?: string; dimension?: string } | null;
      if (!d?.experimentId || !d?.variant) continue;
      const key = cellKey(d);
      const cur = grid.get(key) || { impressions: 0, conversions: 0 };
      cur[field] += 1;
      grid.set(key, cur);
    }
  }

  bump(impRaw, 'impressions');
  bump(convRaw, 'conversions');

  const experiments = [...grid.entries()].map(([key, v]) => {
    const parts = key.split(':');
    const dimension = parts.length >= 3 ? (parts[2] === '_' ? null : parts[2]) : null;
    const variant = parts.length >= 2 ? parts[1]! : '?';
    const experimentId = parts[0] ?? key;
    const rate =
      v.impressions > 0 ? Math.round((v.conversions / v.impressions) * 1000) / 10 : null;
    return { experimentId, variant, dimension, ...v, conversionRatePercent: rate };
  });

  return NextResponse.json({
    windowDays: 30,
    experiments: experiments.sort((a, b) => b.impressions - a.impressions),
  });
}
