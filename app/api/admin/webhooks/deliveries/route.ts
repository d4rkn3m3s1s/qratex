import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/webhooks/deliveries
 * Webhook teslim sonuçlarını (webhook-dispatch'in AnalyticsEvent'e yazdığı
 * 'webhook_delivery' olayları) döndürür. Admin'in entegrasyon sağlığını
 * görmesi için: webhook başına başarı/başarısızlık özeti + son hatalar.
 *
 * ?webhookId=... ile tek bir webhook'a filtrelenebilir.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const webhookId = new URL(request.url).searchParams.get('webhookId');

    const rows = await prisma.analyticsEvent.findMany({
      where: {
        event: 'webhook_delivery',
        category: 'webhook',
        ...(webhookId ? { data: { path: ['webhookId'], equals: webhookId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, data: true, createdAt: true },
    });

    // webhook başına özet: toplam, başarılı, son hata, son teslim zamanı.
    type Summary = {
      webhookId: string;
      total: number;
      success: number;
      failed: number;
      lastStatus: number | null;
      lastError: string | null;
      lastAt: string | null;
    };
    const byWebhook = new Map<string, Summary>();
    const recent: Array<{
      webhookId: string;
      targetEvent: string | null;
      ok: boolean;
      status: number | null;
      error: string | null;
      at: string;
    }> = [];

    for (const r of rows) {
      const d = (r.data ?? {}) as Record<string, unknown>;
      const wId = typeof d.webhookId === 'string' ? d.webhookId : 'unknown';
      const ok = d.ok === true;
      const status = typeof d.status === 'number' ? d.status : null;
      const error = typeof d.error === 'string' ? d.error : null;
      const targetEvent = typeof d.targetEvent === 'string' ? d.targetEvent : null;
      const at = r.createdAt.toISOString();

      let s = byWebhook.get(wId);
      if (!s) {
        s = { webhookId: wId, total: 0, success: 0, failed: 0, lastStatus: null, lastError: null, lastAt: null };
        byWebhook.set(wId, s);
      }
      s.total += 1;
      if (ok) s.success += 1;
      else s.failed += 1;
      // rows zaten desc sıralı → ilk görülen = en yeni.
      if (s.lastAt === null) {
        s.lastAt = at;
        s.lastStatus = status;
        s.lastError = error;
      }

      if (recent.length < 100) {
        recent.push({ webhookId: wId, targetEvent, ok, status, error, at });
      }
    }

    return NextResponse.json(
      { summaries: Array.from(byWebhook.values()), recent },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (e) {
    console.error('Webhook deliveries GET error:', e);
    return NextResponse.json(
      { error: 'Teslim geçmişi alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
