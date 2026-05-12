import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSnapshot, trackRequest } from '@/lib/metrics';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

export type HealthResponse = {
  ok: boolean;
  timestamp: string;
  region?: string;
  runtime: 'nodejs';
  latencyMs: number;
  database?: 'ok' | 'error';
  metrics: ReturnType<typeof getSnapshot>;
};

export async function GET() {
  const start = Date.now();
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    let database: 'ok' | 'error' | undefined;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      database = 'error';
    }

    const metrics = getSnapshot();
    const latencyMs = Date.now() - start;

    trackRequest('/api/admin/health', true, latencyMs);

    const body: HealthResponse = {
      ok: database !== 'error',
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION,
      runtime: 'nodejs',
      latencyMs,
      database,
      metrics,
    };

    return NextResponse.json(body);
  } catch (err) {
    const latencyMs = Date.now() - start;
    trackRequest('/api/admin/health', false, latencyMs);
    console.error('Admin health error:', err);
    return NextResponse.json(
      {
        ok: false,
        timestamp: new Date().toISOString(),
        runtime: 'nodejs',
        latencyMs,
        metrics: getSnapshot(),
        error: err instanceof Error ? err.message : 'Health check failed',
      } as HealthResponse & { error?: string },
      { status: 500 }
    );
  }
}
