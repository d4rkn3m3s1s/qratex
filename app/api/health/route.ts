import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Sağlık kontrolü: DB bağlantısı ve uygulama durumu.
 * Uptime checker veya load balancer için kullanılabilir.
 * ?light=1 → readiness: sadece DB ping, minimal yanıt (deployment probe için).
 */
export async function GET(request: NextRequest) {
  const light = request.nextUrl.searchParams.get('light') === '1';
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    if (light) {
      return NextResponse.json(
        { status: 'ok', latencyMs },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: { database: { status: 'ok', latencyMs } },
        version: process.env.npm_package_version ?? '1.0.0',
        runtime: {
          nodeEnv: process.env.NODE_ENV,
          uptimeSeconds: Math.round(process.uptime()),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Database unreachable';
    if (light) {
      return NextResponse.json(
        { status: 'error', error },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: { database: { status: 'error', error } },
        version: process.env.npm_package_version ?? '1.0.0',
        runtime: {
          nodeEnv: process.env.NODE_ENV,
          uptimeSeconds: Math.round(process.uptime()),
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
