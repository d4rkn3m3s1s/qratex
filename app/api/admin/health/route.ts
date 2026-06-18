import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSnapshot, trackRequest } from '@/lib/metrics';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getMailDeliverySummary, type MailDeliverySummary } from '@/lib/mail-sender';


export const dynamic = 'force-dynamic';

export type OpsHealth = {
  /** İşlenmemiş outbox event sayısı (kuyruk birikmesi). */
  queuePending: number;
  /** En eski bekleyen event'in yaşı (sn); kuyruk takılırsa büyür. null = boş kuyruk. */
  queueOldestAgeSec: number | null;
  /** Son 24s webhook teslim denemesi ve başarısızlık sayısı. */
  webhookDeliveries24h: number;
  webhookFailures24h: number;
  /** Son 24s aktif kullanıcı (analytics event üreten benzersiz kullanıcı). */
  activeUsers24h: number;
};

export type HealthResponse = {
  ok: boolean;
  timestamp: string;
  region?: string;
  runtime: 'nodejs';
  latencyMs: number;
  database?: 'ok' | 'error';
  metrics: ReturnType<typeof getSnapshot>;
  mail?: MailDeliverySummary;
  ops?: OpsHealth;
};

/** Operasyonel sinyalleri topla (kuyruk/webhook/aktif kullanıcı). Hata = güvenli varsayılan. */
async function collectOps(): Promise<OpsHealth> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const [queuePending, oldest, webhookRows, activeUsers] = await Promise.all([
      prisma.outboxEvent.count({ where: { processedAt: null } }),
      prisma.outboxEvent.findFirst({
        where: { processedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.analyticsEvent.findMany({
        where: { event: 'webhook_delivery', category: 'webhook', createdAt: { gte: since24h } },
        select: { data: true },
        take: 1000,
      }),
      prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: since24h }, userId: { not: null } },
        select: { userId: true },
        distinct: ['userId'],
        take: 5000,
      }),
    ]);

    const webhookFailures24h = webhookRows.filter((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      return d.ok !== true;
    }).length;

    return {
      queuePending,
      queueOldestAgeSec: oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000) : null,
      webhookDeliveries24h: webhookRows.length,
      webhookFailures24h,
      activeUsers24h: activeUsers.length,
    };
  } catch (e) {
    console.error('[HEALTH_OPS]', e);
    return {
      queuePending: 0,
      queueOldestAgeSec: null,
      webhookDeliveries24h: 0,
      webhookFailures24h: 0,
      activeUsers24h: 0,
    };
  }
}

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

    const ops = await collectOps();

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
      mail: getMailDeliverySummary(),
      ops,
    };

    return NextResponse.json(body, { headers: PRIVATE_NO_STORE_HEADERS });
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
      } as HealthResponse & { error?: string }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
