import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Get pending offline queue items
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'DEALER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pendingItems = await (prisma as any).offlineQueue.findMany({
      where: {
        dealerId: session.user.id,
        status: { in: ['PENDING', 'FAILED'] },
      },
      orderBy: { queuedAt: 'asc' },
    });

    const stats = await (prisma as any).offlineQueue.groupBy({
      by: ['status'],
      where: { dealerId: session.user.id },
      _count: true,
    });

    return NextResponse.json({
      success: true,
      pendingItems,
      stats,
    });
  } catch (error) {
    console.error('Error fetching offline queue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add item to offline queue
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'DEALER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, payload } = body;

    if (!action || !payload) {
      return NextResponse.json({ error: 'Action and payload are required' }, { status: 400 });
    }

    const queueItem = await (prisma as any).offlineQueue.create({
      data: {
        dealerId: session.user.id,
        action,
        payload,
      },
    });

    return NextResponse.json({
      success: true,
      queueItem,
    });
  } catch (error) {
    console.error('Error adding to offline queue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Sync offline queue items
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'DEALER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { items } = body; // Array of { id, action, payload }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 });
    }

    const results = [];

    for (const item of items) {
      try {
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

        // Update queue item status
        await (prisma as any).offlineQueue.update({
          where: { id: item.id },
          data: {
            status: result.success ? 'SYNCED' : 'FAILED',
            error: result.error || null,
            syncedAt: result.success ? new Date() : null,
            retries: { increment: 1 },
          },
        });

        results.push({ id: item.id, ...result });
      } catch (error: any) {
        // Update as failed
        await (prisma as any).offlineQueue.update({
          where: { id: item.id },
          data: {
            status: 'FAILED',
            error: error.message,
            retries: { increment: 1 },
          },
        });

        results.push({ id: item.id, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `${successCount} başarılı, ${failCount} başarısız`,
      results,
    });
  } catch (error) {
    console.error('Error syncing offline queue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
