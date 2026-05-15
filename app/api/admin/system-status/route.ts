import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getMailDeliverySummary } from '@/lib/mail-sender';


export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/system-status
 * Admin dashboard: sunucu durumu, DB gecikmesi, ortam (Vercel/production), yük bilgisi.
 */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const start = Date.now();
    const checks: Record<string, { status: 'ok' | 'error' | 'warn'; latencyMs?: number; message?: string }> = {};

    // Veritabanı
    try {
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - start;
      checks.database = {
        status: dbLatency > 500 ? 'warn' : 'ok',
        latencyMs: dbLatency,
        message: dbLatency > 500 ? 'Yüksek gecikme' : undefined,
      };
    } catch (e) {
      checks.database = {
        status: 'error',
        message: e instanceof Error ? e.message : 'Veritabanına ulaşılamadı',
      };
    }

    const healthy = Object.values(checks).every((c) => c.status === 'ok');
    const degraded = Object.values(checks).some((c) => c.status === 'error');

    // Ortam: Vercel deployment bilgisi (env'den; hassas bilgi yok)
    const env = process.env.NODE_ENV ?? 'development';
    const vercel = !!(
      process.env.VERCEL ||
      process.env.VERCEL_ENV
    );
    const vercelEnv = process.env.VERCEL_ENV as string | undefined; // production | preview | development
    const region = process.env.VERCEL_REGION as string | undefined;

    const mail = getMailDeliverySummary();

    return NextResponse.json({
      success: true,
      status: degraded ? 'error' : healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      mail,
      environment: {
        nodeEnv: env,
        isVercel: vercel,
        vercelEnv: vercelEnv ?? null,
        region: region ?? null,
        label: vercel
          ? `Vercel · ${vercelEnv === 'production' ? 'Production' : vercelEnv === 'preview' ? 'Preview' : 'Development'}`
          : env === 'production'
            ? 'Production'
            : 'Development',
      },
      dbLatencyMs: checks.database?.latencyMs ?? null,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('System status error:', error);
    return NextResponse.json(
      { success: false, status: 'error', error: 'Durum alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
