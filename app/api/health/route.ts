import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

const HEALTH_DB_ERROR_HEADERS: Record<string, string> = {
  ...PRIVATE_NO_STORE_HEADERS,
  'Retry-After': '10',
};

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
        { status: 200, headers: PRIVATE_NO_STORE_HEADERS }
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
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Database unreachable';
    if (light) {
      return NextResponse.json(
        { status: 'error', error },
        { status: 503, headers: HEALTH_DB_ERROR_HEADERS }
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
      { status: 503, headers: HEALTH_DB_ERROR_HEADERS }
    );
  }
}
