import { NextRequest, NextResponse, after } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  PRIVATE_NO_STORE_HEADERS,
  clampPageParam,
  clampPageSizeParam,
  paginationSkip,
  responseIfDatabaseUnavailable,
} from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { isEconomyError } from '@/lib/economy';
import {
  createConsumption,
  isConsumptionError,
  runConsumptionSideEffects,
} from '@/lib/consumption/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/consumptions
 * Bayinin kaydettiği tüketimleri listele.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const page = clampPageParam(searchParams.get('page'));
    const pageSize = clampPageSizeParam(searchParams.get('pageSize'), 20, 100);
    const skip = paginationSkip(page, pageSize);

    const [consumptions, total] = await Promise.all([
      prisma.consumption.findMany({
        where: { dealerId: session.user.id },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        // Açık select: ham müşteri/bayi kimliği (customerId, dealerId) yanıta sızmaz.
        select: {
          id: true,
          amount: true,
          note: true,
          productId: true,
          createdAt: true,
          updatedAt: true,
          card: { select: { id: true, token: true } },
          customer: { select: { name: true, email: true, image: true } },
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              category: { select: { id: true, name: true, icon: true } },
            },
          },
          review: { select: { id: true, rating: true, text: true } },
        },
      }),
      prisma.consumption.count({ where: { dealerId: session.user.id } }),
    ]);

    const items = consumptions.map((row) => {
      const token = row.card?.token;
      const tokenPublic = typeof token === 'string' && token.length > 0 ? token.slice(-4) : '';
      return {
        ...row,
        card: row.card ? { id: row.card.id, token: tokenPublic } : row.card,
      };
    });

    return NextResponse.json(
      {
        success: true,
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching consumptions:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Tüketimler getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/**
 * POST /api/dealer/consumptions
 * Yeni tüketim kaydı oluştur. Tüm kurallar (kart durumu, oran sınırı, ürün sahipliği,
 * çarpan politikası, pasif puan `mintPoints` ile tek transaction) lib/consumption/service.ts'te.
 *
 * İdempotency: gövdede `clientOpId` ya da `Idempotency-Key` başlığı (8–100 karakter).
 * Aynı anahtarla tekrar gönderim yeni kayıt/puan üretmez, ilk kaydı `duplicate: true` döner.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Geçersiz JSON gövdesi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Geçersiz istek gövdesi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const headerKey = request.headers.get('idempotency-key');
    const input = {
      ...(body as Record<string, unknown>),
      clientOpId: (body as { clientOpId?: unknown }).clientOpId ?? (headerKey || undefined),
    };

    const now = new Date();
    const result = await createConsumption(input, {
      dealerId: session.user.id,
      channel: 'live',
      now,
      ...getAuditRequestMeta(request),
    });

    if (!result.duplicate) {
      const revenue = result.consumption.amount ?? 0;
      after(() =>
        runConsumptionSideEffects({
          dealerId: session.user.id,
          customerId: result.customerId,
          revenue,
          at: now,
        })
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.duplicate ? 'Bu tüketim zaten kaydedilmiş' : 'Tüketim kaydı oluşturuldu',
        duplicate: result.duplicate,
        consumption: result.consumption,
        passivePoints: result.passive.credited,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isConsumptionError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.httpStatus,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(error.retryAfterSec ? { 'Retry-After': String(error.retryAfterSec) } : {}),
          },
        }
      );
    }
    if (isEconomyError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    console.error('Error creating consumption:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Tüketim kaydı oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
