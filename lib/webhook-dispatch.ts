/**
 * Webhook dispatcher — admin'de kayıtlı webhook'lara olay tetikler (Entegrasyon Merkezi).
 *
 * Bir olay olduğunda o olaya abone AKTİF ve ARŞİVLENMEMİŞ webhook'ları bulur, imzalı POST
 * gönderir ve her teslimi AnalyticsEvent'e (event 'webhook_delivery', category 'webhook')
 * yazar. Teslim günlüğü, "Yeniden gönder" ve sağlık oranları bu kayıttan okunur.
 *
 * Güvenilirlik:
 *  - Çağıranlar `after()` / `runAfter` içinde çağırır (serverless yanıt sonrası tamamlanır).
 *  - Geçici hatalarda (ağ, zaman aşımı, 429, 5xx) en fazla 3 deneme, artan bekleme (1 sn, 3 sn).
 *  - Her teslimde hedef yeniden doğrulanır (SSRF, DNS rebinding) ve yönlendirme İZLENMEZ
 *    (safeWebhookPost: node:https yönlendirme izlemez; 3xx başarısız sayılır).
 *  - Art arda 15 başarısız teslimden sonra webhook otomatik duraklatılır (denetim kaydıyla).
 *
 * İmza (geriye uyumlu):
 *   X-Qratex-Signature:    sha256=<hex hmac(body)>                 (eski alıcılar)
 *   X-Qratex-Signature-V2: t=<unix>,v1=<hex hmac(`${t}.${body}`)>   (zaman damgalı, önerilen)
 *   X-Qratex-Timestamp, X-Qratex-Delivery (idempotency kimliği), X-Qratex-Event
 */
import { createHmac, randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { WEBHOOK_TEST_EVENT, type WebhookEventKey } from '@/lib/integrations/contract';
import { parseWebhookMeta, serializeWebhookMeta } from '@/lib/integrations/meta';
import { openSecret } from '@/lib/integrations/secret-box';
import { assertSafeWebhookUrl } from '@/lib/integrations/url-safety';
import { safeWebhookPost } from '@/lib/safe-webhook-post';

/** Yalnız gerçekten tetiklenen olaylar (lib/integrations/contract.ts WEBHOOK_EVENTS). */
export type WebhookEvent = WebhookEventKey;

const DELIVERY_TIMEOUT_MS = 8000;
const MAX_WEBHOOKS_PER_EVENT = 50;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 3000];
const AUTO_DISABLE_AFTER = 15;
const BODY_LOG_LIMIT = 16_000;
const RESPONSE_SNIPPET_LIMIT = 500;

export type DeliveryErrorKind = 'timeout' | 'network' | 'blocked_url' | 'redirect' | 'http_4xx' | 'http_5xx' | 'secret';

export type DeliveryOutcome = {
  deliveryId: string;
  webhookId: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  errorKind: DeliveryErrorKind | null;
  durationMs: number;
  attempts: number;
  responseSnippet: string | null;
};

type Target = { id: string; url: string; secret: string | null };

export function signV1(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function signV2(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryable(o: { status: number | null; errorKind: DeliveryErrorKind | null }): boolean {
  if (o.errorKind === 'timeout' || o.errorKind === 'network') return true;
  return o.status === 429 || (o.status !== null && o.status >= 500);
}

async function attemptOnce(
  target: Target,
  plainSecret: string | null,
  event: string,
  body: string,
  deliveryId: string
): Promise<Omit<DeliveryOutcome, 'deliveryId' | 'webhookId' | 'durationMs' | 'attempts'>> {
  const safe = await assertSafeWebhookUrl(target.url);
  if (!safe.ok) return { ok: false, status: null, error: safe.reason, errorKind: 'blocked_url', responseSnippet: null };

  const ts = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Qratex-Webhooks/2',
    'X-Qratex-Event': event,
    'X-Qratex-Delivery': deliveryId,
    'X-Qratex-Timestamp': String(ts),
  };
  if (plainSecret) {
    headers['X-Qratex-Signature'] = `sha256=${signV1(plainSecret, body)}`;
    headers['X-Qratex-Signature-V2'] = `t=${ts},v1=${signV2(plainSecret, ts, body)}`;
  }

  // Teslim tek kaynak safeWebhookPost ile: bağlantı anında çözülen IP denetlenir (DNS rebinding
  // TOCTOU yok), yönlendirme izlenmez, toplam süre + yanıt boyutu sınırlı.
  try {
    const res = await safeWebhookPost(safe.url.toString(), body, headers, { timeoutMs: DELIVERY_TIMEOUT_MS, maxBytes: RESPONSE_SNIPPET_LIMIT });
    const snippet = res.body.slice(0, RESPONSE_SNIPPET_LIMIT) || null;
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: res.status, error: 'Hedef yönlendirme döndürdü; yönlendirmeler izlenmez.', errorKind: 'redirect', responseSnippet: snippet };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Hedef HTTP ${res.status} döndürdü.`,
        errorKind: res.status >= 500 ? 'http_5xx' : 'http_4xx',
        responseSnippet: snippet,
      };
    }
    return { ok: true, status: res.status, error: null, errorKind: null, responseSnippet: snippet };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === 'ESSRF' || /^SSRF/.test(e?.message ?? '')) {
      return { ok: false, status: null, error: 'Hedef özel/iç ağ adresine çözümleniyor; gönderilmedi.', errorKind: 'blocked_url', responseSnippet: null };
    }
    const timedOut = e?.code === 'ETIMEDOUT';
    return {
      ok: false,
      status: null,
      error: timedOut ? `Hedef ${DELIVERY_TIMEOUT_MS / 1000} sn içinde yanıt vermedi.` : 'Hedefe bağlanılamadı (DNS/TLS/ağ).',
      errorKind: timedOut ? 'timeout' : 'network',
      responseSnippet: null,
    };
  }
}

/** Tek hedefe teslim (yeniden denemeli). Hata fırlatmaz. */
export async function deliverWithRetry(
  target: Target,
  event: string,
  body: string,
  opts: { maxAttempts?: number; wait?: (ms: number) => Promise<void> } = {}
): Promise<DeliveryOutcome> {
  const deliveryId = randomUUID();
  const started = Date.now();
  const secret = openSecret(target.secret);
  if (secret && typeof secret === 'object') {
    return { deliveryId, webhookId: target.id, ok: false, status: null, error: secret.error, errorKind: 'secret', durationMs: 0, attempts: 0, responseSnippet: null };
  }
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  const wait = opts.wait ?? sleep;
  let last: Awaited<ReturnType<typeof attemptOnce>> | null = null;
  let attempts = 0;
  for (let i = 0; i < max; i += 1) {
    attempts += 1;
    last = await attemptOnce(target, secret, event, body, deliveryId);
    if (last.ok || !isRetryable(last)) break;
    if (i < max - 1) await wait(BACKOFF_MS[i] ?? 3000);
  }
  return { deliveryId, webhookId: target.id, durationMs: Date.now() - started, attempts, ...(last as NonNullable<typeof last>) };
}

export function buildEventBody(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
}

/** Teslim kaydı (AnalyticsEvent). Gövde 16 KB'tan büyükse saklanmaz (yeniden gönderilemez). */
export async function logDeliveries(
  outcomes: DeliveryOutcome[],
  event: string,
  body: string,
  extra: { test?: boolean; resendOf?: string | null; userId?: string | null } = {}
): Promise<string[]> {
  if (outcomes.length === 0) return [];
  const storeBody = body.length <= BODY_LOG_LIMIT ? body : null;
  const ids: string[] = [];
  try {
    for (const o of outcomes) {
      const row = await prisma.analyticsEvent.create({
        data: {
          userId: extra.userId ?? null,
          event: 'webhook_delivery',
          category: 'webhook',
          data: {
            webhookId: o.webhookId,
            targetEvent: event,
            deliveryId: o.deliveryId,
            ok: o.ok,
            status: o.status,
            ...(o.error ? { error: o.error } : {}),
            ...(o.errorKind ? { errorKind: o.errorKind } : {}),
            durationMs: o.durationMs,
            attempts: o.attempts,
            ...(o.responseSnippet ? { responseSnippet: o.responseSnippet } : {}),
            ...(storeBody ? { body: storeBody } : {}),
            ...(extra.test ? { test: true } : {}),
            ...(extra.resendOf ? { resendOf: extra.resendOf } : {}),
          },
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
  } catch (err) {
    console.error('[WEBHOOK_DISPATCH] teslim logu yazılamadı:', err);
  }
  return ids;
}

/** Art arda AUTO_DISABLE_AFTER başarısız teslim → otomatik duraklat. */
export async function autoDisableIfFailing(webhookId: string): Promise<boolean> {
  try {
    const recent = await prisma.analyticsEvent.findMany({
      where: { event: 'webhook_delivery', category: 'webhook', data: { path: ['webhookId'], equals: webhookId } },
      orderBy: { createdAt: 'desc' },
      take: AUTO_DISABLE_AFTER,
      select: { data: true },
    });
    if (recent.length < AUTO_DISABLE_AFTER) return false;
    const allFailed = recent.every((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      return d.ok !== true && d.test !== true;
    });
    if (!allFailed) return false;
    const wh = await prisma.webhook.findUnique({ where: { id: webhookId }, select: { isActive: true, events: true } });
    if (!wh?.isActive) return false;
    const meta = parseWebhookMeta(wh.events);
    await prisma.$transaction([
      prisma.webhook.update({
        where: { id: webhookId },
        data: { isActive: false, events: serializeWebhookMeta({ ...meta, disabledReason: 'auto_failures' }) as object },
      }),
      prisma.auditLog.create({
        data: {
          userId: null,
          actorType: 'system',
          action: 'AUTO_PAUSE_WEBHOOK',
          entity: 'Webhook',
          entityId: webhookId,
          newData: { reason: 'auto_failures', consecutiveFailures: AUTO_DISABLE_AFTER } as object,
        },
      }),
    ]);
    return true;
  } catch (err) {
    console.error('[WEBHOOK_DISPATCH] otomatik duraklatma denetimi başarısız:', err);
    return false;
  }
}

/**
 * Verilen olaya abone tüm aktif webhook'lara payload gönderir. Çağıran `after()` içinde
 * `await` etmelidir. Webhook yoksa hiçbir şey yapmaz (no-op). Hata fırlatmaz.
 */
export async function dispatchWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
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

  const subscribed = webhooks.filter((w) => {
    const meta = parseWebhookMeta(w.events);
    return !meta.archivedAt && meta.events.includes(event);
  });
  if (subscribed.length === 0) return;

  const body = buildEventBody(event, payload);
  const outcomes = await Promise.all(subscribed.map((w) => deliverWithRetry(w, event, body)));
  await logDeliveries(outcomes, event, body);
  await Promise.all(outcomes.filter((o) => !o.ok).map((o) => autoDisableIfFailing(o.webhookId)));
}

/** "Test gönder" için örnek olay gövdesi. */
export function testEventBody(sampleEvent: string | null, sample: Record<string, unknown> | null): string {
  return buildEventBody(WEBHOOK_TEST_EVENT, {
    message: 'Qratex webhook bağlantı testi. Bu olay yalnız bu uca gönderildi.',
    ...(sampleEvent ? { sampleEvent, sample } : {}),
  });
}
