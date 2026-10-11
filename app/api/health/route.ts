import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getMailDeliverySummary } from '@/lib/mail-sender';
import { authorizeInternalJobRequest } from '@/lib/inngest/internal-http';

const HEALTH_DB_ERROR_HEADERS: Record<string, string> = {
  ...PRIVATE_NO_STORE_HEADERS,
  'Retry-After': '10',
};

/** Anonim yanıtta ham DB hata metni yerine (bağlantı dizesi/sunucu adı sızmasın — arka plan D5). */
const PUBLIC_DB_ERROR = 'Veritabanına şu an ulaşılamıyor.';

function mailCheck(mail: ReturnType<typeof getMailDeliverySummary>) {
  if (!mail.configured) return { status: 'warn' as const, message: 'SMTP veya RESEND_API_KEY tanımlanmadı' };
  if (mail.resendSandboxSender) {
    return { status: 'warn' as const, message: 'Resend gönderen adresi sandbox (onboarding@resend.dev) — RESEND_FROM doğrulanmış alan adı olmalı' };
  }
  return { status: 'ok' as const, message: 'İşlem e-postası (SMTP veya Resend) yapılandırıldı' };
}

/**
 * Sağlık kontrolü.
 *  - `?live=1` → LIVENESS: veritabanına DOKUNMAZ (süreç ayakta mı). Dış uptime izleyicileri bunu
 *    kullanmalı: dakikalık DB pingi Neon compute'unu 7/24 uyanık tutar (arka plan D5).
 *  - `?light=1` → READINESS: yalnız DB ping, minimal yanıt (deployment probe, landing canlı durum).
 *  - parametresiz → DB + (yalnız yetkili çağrıda) e-posta/sürüm/çalışma süresi ayrıntısı.
 * Ayrıntılar ve ham hata metni yalnız iç iş sırrıyla (Bearer) gelen çağrıya verilir; anonim
 * yanıt her durumda minimal kalır (keşif yüzeyi açılmaz).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get('live') === '1') {
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }, { status: 200, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const light = params.get('light') === '1';
  const authorized = authorizeInternalJobRequest(request);
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    if (light) {
      return NextResponse.json({ status: 'ok', latencyMs }, { status: 200, headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: 'ok', latencyMs },
          ...(authorized ? { transactionalEmail: mailCheck(getMailDeliverySummary()) } : {}),
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
    const rawError = e instanceof Error ? e.message : 'Database unreachable';
    if (!authorized) console.error('[health] DB ping başarısız:', rawError);
    const error = authorized ? rawError : PUBLIC_DB_ERROR;
    if (light) {
      return NextResponse.json({ status: 'error', error }, { status: 503, headers: HEALTH_DB_ERROR_HEADERS });
    }
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: 'error', error },
          ...(authorized ? { transactionalEmail: mailCheck(getMailDeliverySummary()) } : {}),
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
      { status: 503, headers: HEALTH_DB_ERROR_HEADERS }
    );
  }
}
