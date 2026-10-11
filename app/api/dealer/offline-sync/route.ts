import { NextRequest, NextResponse, after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { isEconomyError } from '@/lib/economy';
import {
  consumptionInputSchema,
  createConsumption,
  isConsumptionError,
  runConsumptionSideEffects,
  type ConsumptionErrorCode,
} from '@/lib/consumption/service';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';

/**
 * Bayi çevrimdışı kuyruğu (P0-18 sertleştirmesi).
 *
 * Önceden PATCH istemcinin gönderdiği `action`/`payload`'ı işliyordu, kuyruk durumuna
 * bakmıyordu (aynı id ile sınırsız tekrar), tutar `parseFloat` ile sınırsızdı, denetim kaydı
 * yoktu ve `SCAN_CARD` BLOCKED kart dahil müşteri e-postasını döndürüyordu. Şimdi:
 *  - POST yalnız `CREATE_CONSUMPTION` kabul eder; payload kuyruğa girerken şemayla doğrulanır.
 *  - PATCH yalnız kuyruk KİMLİKLERİNİ alır; action/payload DB'deki satırdan okunur.
 *  - Her öğe `status ∈ {PENDING, FAILED}` + `retries` eşitliği koşuluyla atomik olarak
 *    sahiplenilir (CAS); eşzamanlı ikinci senkronizasyon aynı öğeyi işleyemez.
 *  - Tüketim canlı uçla ortak `createConsumption` (oran sınırı, ürün sahipliği, kart durumu,
 *    tutar sınırı, denetim, bildirim, pasif puan tek tx) ve `clientOpId = offline:<kuyrukId>`
 *    ile yazılır → @@unique(dealerId, clientOpId) aynı öğeden ikinci tüketimi imkânsız kılar.
 *  - `SCAN_CARD` kaldırıldı.
 *  - Yalnız DEALER: işletme kimliği oturumdan (`session.user.id`) alındığı için ADMIN kendi
 *    kimliğiyle "işletme" olup her karta tüketim + pasif puan yazabiliyordu (kasa kuralı:
 *    ADMIN kasada yazamaz).
 */

export const dynamic = 'force-dynamic';

/** Bir kuyruk öğesi bu kadar denemeden sonra "ölü" (DEAD) sayılır — sonsuz retry önlemi. */
const MAX_QUEUE_RETRIES = 5;
/** Tek PATCH'te işlenen en fazla öğe (her biri birkaç sorgu + tx; serverless süresi). */
const MAX_BATCH = 50;
/** Bayi başına bekleyen öğe tavanı. */
const MAX_PENDING_PER_DEALER = 500;
const SUPPORTED_ACTIONS = ['CREATE_CONSUMPTION'] as const;
const RETRYABLE_STATUSES = ['PENDING', 'FAILED'];

/** Kalıcı hatalar: tekrar denemek sonucu değiştirmez → doğrudan DEAD. */
const PERMANENT_ERRORS: ReadonlySet<ConsumptionErrorCode> = new Set<ConsumptionErrorCode>([
  'VALIDATION',
  'CARD_NOT_FOUND',
  'CARD_BLOCKED',
  'CARD_ARCHIVED',
  'SELF_DEALING',
  'PRODUCT_NOT_FOUND',
  'PRODUCT_FORBIDDEN',
  'CLIENT_OP_CONFLICT',
]);

const QUEUE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

// GET - Bekleyen kuyruk öğeleri
export async function GET() {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const limited = await enforceRouteRateLimit('dealer.offline-sync.list', session.user.id, 'read');
    if (limited) return limited;

    const pendingItems = await prisma.offlineQueue.findMany({
      where: {
        dealerId: session.user.id,
        status: { in: RETRYABLE_STATUSES },
        retries: { lt: MAX_QUEUE_RETRIES },
        action: { in: [...SUPPORTED_ACTIONS] },
      },
      orderBy: { queuedAt: 'asc' },
      take: MAX_PENDING_PER_DEALER,
    });

    const stats = await prisma.offlineQueue.groupBy({
      by: ['status'],
      where: { dealerId: session.user.id },
      _count: true,
    });

    return json({ success: true, pendingItems, stats });
  } catch (error) {
    console.error('Error fetching offline queue:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return json({ error: 'Kuyruk alınamadı' }, 500);
  }
}

// POST - Kuyruğa öğe ekle (yalnız CREATE_CONSUMPTION, doğrulanmış payload)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Geçersiz JSON gövdesi' }, 400);
    }
    const { action, payload } = (body ?? {}) as { action?: unknown; payload?: unknown };

    if (typeof action !== 'string' || !(SUPPORTED_ACTIONS as readonly string[]).includes(action)) {
      return json({ error: 'Desteklenmeyen işlem. Yalnız CREATE_CONSUMPTION kuyruğa alınabilir.' }, 400);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ error: 'payload bir JSON nesnesi olmalı' }, 400);
    }
    // clientOpId sunucu tarafından atanır (offline:<kuyrukId>); istemcininki yok sayılır.
    const parsed = consumptionInputSchema.safeParse({ ...(payload as Record<string, unknown>), clientOpId: null });
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0]?.message ?? 'Geçersiz tüketim verisi' }, 400);
    }

    const rl = await checkRateLimitDb(`offline-enqueue:${session.user.id}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok hızlı! Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            'Retry-After': String(Math.max(1, Math.ceil((rl.retryAfterMs ?? 1000) / 1000))),
          },
        }
      );
    }

    const pending = await prisma.offlineQueue.count({
      where: { dealerId: session.user.id, status: { in: RETRYABLE_STATUSES } },
    });
    if (pending >= MAX_PENDING_PER_DEALER) {
      return json({ error: 'Bekleyen kuyruk dolu. Önce mevcut kayıtları senkronize edin.' }, 409);
    }

    const { clientOpId: _ignored, ...cleanPayload } = parsed.data;
    void _ignored;
    const queueItem = await prisma.offlineQueue.create({
      data: {
        dealerId: session.user.id,
        action,
        payload: cleanPayload as Prisma.InputJsonObject,
      },
    });

    return json({ success: true, queueItem });
  } catch (error) {
    console.error('Error adding to offline queue:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return json({ error: 'Kuyruğa eklenemedi' }, 500);
  }
}

type SyncResult = {
  id: string;
  success: boolean;
  error?: string;
  code?: string;
  consumptionId?: string;
  duplicate?: boolean;
  skipped?: boolean;
  retryable?: boolean;
};

/** Gövdeden yalnız kuyruk kimliklerini çıkarır: `{ ids: [...] }` ya da eski `{ items: [{ id }] }`. */
function extractIds(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { ids?: unknown; items?: unknown };
  let raw: unknown[] | null = null;
  if (Array.isArray(b.ids)) raw = b.ids;
  else if (Array.isArray(b.items)) raw = b.items.map((it) => (it && typeof it === 'object' ? (it as { id?: unknown }).id : it));
  if (!raw) return null;
  return raw.map((v) => (typeof v === 'string' ? v : ''));
}

// PATCH - Kuyruk öğelerini senkronize et (yalnız kimlik listesi; içerik DB'den)
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('dealer.offline-sync.patch', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;
    const dealerId = session.user.id;
    const auditMeta = getAuditRequestMeta(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Geçersiz JSON gövdesi' }, 400);
    }
    const rawIds = extractIds(body);
    if (!rawIds) {
      return json({ error: 'Kuyruk kimlikleri (ids) gerekli' }, 400);
    }

    const unique = Array.from(new Set(rawIds));
    const ids = unique.slice(0, MAX_BATCH);
    const truncated = unique.length > MAX_BATCH;
    const results: SyncResult[] = [];

    for (const id of ids) {
      if (!QUEUE_ID_RE.test(id)) {
        results.push({ id, success: false, error: 'Geçersiz öğe' });
        continue;
      }

      const row = await prisma.offlineQueue.findFirst({
        where: { id, dealerId },
        select: { id: true, action: true, payload: true, status: true, retries: true },
      });
      if (!row) {
        results.push({ id, success: false, error: 'Kayıt bulunamadı veya yetkisiz' });
        continue;
      }
      if (row.status === 'SYNCED') {
        results.push({ id, success: true, skipped: true, duplicate: true });
        continue;
      }
      if (!RETRYABLE_STATUSES.includes(row.status) || row.retries >= MAX_QUEUE_RETRIES) {
        results.push({ id, success: false, skipped: true, error: 'Bu öğenin deneme hakkı doldu' });
        continue;
      }
      if (!(SUPPORTED_ACTIONS as readonly string[]).includes(row.action)) {
        // Eski SCAN_CARD vb. öğeler: bir daha denenmesin.
        await prisma.offlineQueue.updateMany({
          where: { id, dealerId, status: { in: RETRYABLE_STATUSES } },
          data: { status: 'DEAD', error: 'Desteklenmeyen işlem' },
        });
        results.push({ id, success: false, error: 'Desteklenmeyen işlem' });
        continue;
      }

      // Atomik sahiplenme (CAS): okuduğumuz retries değeri hâlâ geçerliyse bu deneme bizim.
      const claim = await prisma.offlineQueue.updateMany({
        where: { id, dealerId, status: { in: RETRYABLE_STATUSES }, retries: row.retries },
        data: { retries: { increment: 1 } },
      });
      if (claim.count !== 1) {
        results.push({ id, success: false, skipped: true, error: 'Bu öğe başka bir senkronizasyonda işleniyor' });
        continue;
      }
      const attempt = row.retries + 1;

      try {
        const payload =
          row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {};
        const now = new Date();
        const result = await createConsumption(
          { ...payload, clientOpId: `offline:${row.id}` },
          { dealerId, channel: 'offline', now, ...auditMeta }
        );
        await prisma.offlineQueue.updateMany({
          where: { id, dealerId },
          data: { status: 'SYNCED', error: null, syncedAt: now },
        });
        if (!result.duplicate) {
          const revenue = result.consumption.amount ?? 0;
          after(() =>
            runConsumptionSideEffects({ dealerId, customerId: result.customerId, revenue, at: now })
          );
        }
        results.push({ id, success: true, consumptionId: result.consumption.id, duplicate: result.duplicate });
      } catch (error) {
        let message = 'Tüketim kaydı işlenemedi';
        let code: string | undefined;
        let permanent = false;
        let retryable = false;
        if (isConsumptionError(error)) {
          message = error.message;
          code = error.code;
          permanent = PERMANENT_ERRORS.has(error.code);
          retryable = error.retryable;
        } else if (isEconomyError(error)) {
          message = error.message;
          code = error.code;
        } else {
          // Ham hata (Prisma constraint adları vb.) istemciye sızmaz.
          console.error('[offline-sync] tüketim işlenemedi:', error instanceof Error ? error.message : error);
        }

        if (retryable) {
          // Oran sınırı geçici: deneme hakkı yakılmaz.
          await prisma.offlineQueue.updateMany({
            where: { id, dealerId, retries: attempt },
            data: { retries: { decrement: 1 }, error: message },
          });
        } else {
          await prisma.offlineQueue.updateMany({
            where: { id, dealerId },
            data: {
              status: permanent || attempt >= MAX_QUEUE_RETRIES ? 'DEAD' : 'FAILED',
              error: message.slice(0, 500),
            },
          });
        }
        results.push({ id, success: false, error: message, ...(code ? { code } : {}), ...(retryable ? { retryable } : {}) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return json({
      success: true,
      message: `${successCount} başarılı, ${failCount} başarısız`,
      results,
      ...(truncated ? { truncated: true, maxBatch: MAX_BATCH } : {}),
    });
  } catch (error) {
    console.error('Error syncing offline queue:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return json({ error: 'Senkronizasyon başarısız' }, 500);
  }
}
