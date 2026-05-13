import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

// GET - Get pending offline queue items

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const pendingItems = await prisma.offlineQueue.findMany({
      where: {
        dealerId: session.user.id,
        status: { in: ['PENDING', 'FAILED'] },
      },
      orderBy: { queuedAt: 'asc' },
      take: 500,
    });

    const stats = await prisma.offlineQueue.groupBy({
      by: ['status'],
      where: { dealerId: session.user.id },
      _count: true,
    });

    return NextResponse.json({
      success: true,
      pendingItems,
      stats,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching offline queue:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// POST - Add item to offline queue
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const { action, payload } = body;

    if (!action || typeof action !== 'string' || action.length === 0 || action.length > 120) {
      return NextResponse.json(
        { error: 'Geçerli bir action gerekli (en fazla 120 karakter)' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (payload === undefined || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json(
        { error: 'payload bir JSON nesnesi olmalı' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const queueItem = await prisma.offlineQueue.create({
      data: {
        dealerId: session.user.id,
        action,
        payload,
      },
    });

    return NextResponse.json({
      success: true,
      queueItem,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error adding to offline queue:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// PATCH - Sync offline queue items
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const { items: rawItems } = body; // Array of { id, action, payload }

    if (!rawItems || !Array.isArray(rawItems)) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const MAX_BATCH = 100;
    const items = rawItems.slice(0, MAX_BATCH);
    const truncated = rawItems.length > MAX_BATCH;

    const results = [];

    for (const item of items) {
      try {
        if (
          !item ||
          typeof item.id !== 'string' ||
          item.id.length < 8 ||
          item.id.length > 64 ||
          typeof item.action !== 'string' ||
          item.action.length === 0 ||
          item.action.length > 120
        ) {
          results.push({ id: (item as { id?: string })?.id, success: false, error: 'Geçersiz öğe' });
          continue;
        }

        const owned = await prisma.offlineQueue.findFirst({
          where: { id: item.id, dealerId: session.user.id },
          select: { id: true },
        });
        if (!owned) {
          results.push({ id: item.id, success: false, error: 'Kayıt bulunamadı veya yetkisiz' });
          continue;
        }

        let result;

        // Process based on action type
        switch (item.action) {
          case 'CREATE_CONSUMPTION':
            result = await processConsumption(session.user.id, item.payload);
            break;
          case 'SCAN_CARD':
            result = await processScan(item.payload);
            break;
          default:
            result = { success: false, error: 'Unknown action' };
        }

        // Update queue item status (yalnızca bu bayinin kuyruğu)
        await prisma.offlineQueue.update({
          where: { id: owned.id },
          data: {
            status: result.success ? 'SYNCED' : 'FAILED',
            error: result.error || null,
            syncedAt: result.success ? new Date() : null,
            retries: { increment: 1 },
          },
        });

        results.push({ id: item.id, ...result });
      } catch (error: any) {
        // Update as failed (bayi kapsamı ile)
        await prisma.offlineQueue.updateMany({
          where: { id: item.id, dealerId: session.user.id },
          data: {
            status: 'FAILED',
            error: error?.message != null ? String(error.message) : 'Hata',
            retries: { increment: 1 },
          },
        });

        results.push({ id: item.id, success: false, error: error?.message != null ? String(error.message) : 'Hata' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `${successCount} başarılı, ${failCount} başarısız`,
      results,
      ...(truncated ? { truncated: true, maxBatch: MAX_BATCH } : {}),
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error syncing offline queue:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// Helper function to process consumption
async function processConsumption(dealerId: string, payload: any) {
  try {
    const { cardToken, productId, amount, note } = payload;

    // Find card
    const card = await prisma.physicalCard.findFirst({
      where: { token: cardToken, status: 'ACTIVATED' },
    });

    if (!card || !card.customerId) {
      return { success: false, error: 'Card not found or not activated' };
    }

    // Create consumption
    const consumption = await prisma.consumption.create({
      data: {
        cardId: card.id,
        customerId: card.customerId,
        dealerId,
        productId: productId || null,
        amount: amount ? parseFloat(amount) : null,
        note: note || null,
      },
    });

    return { success: true, consumptionId: consumption.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Helper function to process scan
async function processScan(payload: any) {
  try {
    const { cardToken } = payload;

    const card = await prisma.physicalCard.findFirst({
      where: { token: cardToken },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!card) {
      return { success: false, error: 'Card not found' };
    }

    return { success: true, card };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
