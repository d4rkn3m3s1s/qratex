/**
 * Webhook dispatcher — admin'de kayıtlı webhook'lara olay tetikler.
 *
 * Önceden Webhook modeli yalnızca CRUD'du (oluşturulup saklanıyor ama HİÇBİR
 * olay onları fire etmiyordu). Bu modül döngüyü kapatır: bir olay olduğunda
 * o olaya abone aktif webhook'ları bulur, HMAC-imzalı POST gönderir ve teslim
 * sonucunu AnalyticsEvent'e (category: 'webhook') loglar.
 *
 * Tasarım: ateşle-unut (request yolunu bloklamaz), webhook başına timeout,
 * partner-digest-webhook'taki aynı imza şeması (X-Qratex-Signature: sha256=...).
 */
import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';

export type WebhookEvent =
  | 'feedback.created'
  | 'feedback.replied'
  | 'remedy.created'
  | 'incident.created'
  | 'badge.earned';

const DELIVERY_TIMEOUT_MS = 8000;
const MAX_WEBHOOKS_PER_EVENT = 50;

function signBody(secret: string | null | undefined, body: string): string {
  if (!secret) return '';
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Tek bir webhook'a teslim dener; sonucu (ok/status/error) döndürür.
 * Hata fırlatmaz — çağıran tarafı bloklamamak için yutar ve loglar.
 */
async function deliverOne(
  webhook: { id: string; url: string; secret: string | null },
  event: WebhookEvent,
  body: string
): Promise<{ webhookId: string; ok: boolean; status: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const sig = signBody(webhook.secret, body);
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Qratex-Event': event,
        ...(sig ? { 'X-Qratex-Signature': `sha256=${sig}` } : {}),
      },
      body,
      signal: controller.signal,
    });
    return { webhookId: webhook.id, ok: res.ok, status: res.status };
  } catch (err) {
    return {
      webhookId: webhook.id,
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : 'unknown',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verilen olaya abone tüm aktif webhook'lara payload gönderir.
 * Ateşle-unut: çağıran `await` etmek zorunda değil; sonuçlar AnalyticsEvent'e loglanır.
 * Webhook yoksa hiçbir şey yapmaz (no-op).
 */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  let webhooks: Array<{ id: string; url: string; secret: string | null; events: unknown }>;
  try {
    webhooks = await prisma.webhook.findMany({
      where: { isActive: true },
      select: { id: true, url: true, secret: true, events: true },
      take: MAX_WEBHOOKS_PER_EVENT,
    });
  } catch (err) {
    console.error('[WEBHOOK_DISPATCH] webhook listesi alınamadı:', err);
    return;
  }

  // events Json bir string dizisidir: ["feedback.created", ...]. Bu olaya abone olanları süz.
  const subscribed = webhooks.filter((w) => {
    const evs = Array.isArray(w.events) ? (w.events as unknown[]) : [];
    return evs.includes(event);
  });
  if (subscribed.length === 0) return;

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const results = await Promise.all(subscribed.map((w) => deliverOne(w, event, body)));

  // Teslim sonuçlarını logla (başarısızlık görünürlüğü için).
  try {
    await prisma.analyticsEvent.createMany({
      data: results.map((r) => ({
        event: 'webhook_delivery',
        category: 'webhook',
        data: {
          webhookId: r.webhookId,
          targetEvent: event,
          ok: r.ok,
          status: r.status,
          ...(r.error ? { error: r.error } : {}),
        },
      })),
    });
  } catch (err) {
    console.error('[WEBHOOK_DISPATCH] teslim logu yazılamadı:', err);
  }
}
