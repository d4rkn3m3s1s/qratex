import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getMailDeliverySummary } from '@/lib/mail-sender';
import { authorizeInternalJobRequest } from '@/lib/inngest/internal-http';

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
    const mail = getMailDeliverySummary();
    if (light) {
      return NextResponse.json(
        { status: 'ok', latencyMs },
        { status: 200, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    // Recon yüzeyini daralt: version/runtime/mail detayları yalnızca yetkili
    // (internal job secret) çağrılara verilir; anonim sağlık kontrolü minimal kalır.
    const authorized = authorizeInternalJobRequest(request);
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: 'ok', latencyMs },
          ...(authorized
            ? {
                transactionalEmail: {
                  status: mail.configured ? 'ok' : 'warn',
                  message: mail.configured
                    ? 'İşlem e-postası (SMTP veya Resend) yapılandırıldı'
                    : 'SMTP veya RESEND_API_KEY tanımlanmadı',
                },
              }
            : {}),
        },
        ...(authorized
          ? {
              version: process.env.npm_package_version ?? '1.0.0',
              runtime: {
                nodeEnv: process.env.NODE_ENV,
                uptimeSeconds: Math.round(process.uptime()),
              },
            }
          : {}),
      },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Database unreachable';
    const mail = getMailDeliverySummary();
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
        checks: {
          database: { status: 'error', error },
          transactionalEmail: {
            status: mail.configured ? 'ok' : 'warn',
            message: mail.configured
              ? 'İşlem e-postası yapılandırıldı (veritabanı hariç)'
              : 'SMTP veya RESEND_API_KEY tanımlanmadı',
          },
        },
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
