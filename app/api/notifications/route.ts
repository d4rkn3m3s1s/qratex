import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ANY_SIGNED_IN_ROLE, requireAuth } from '@/lib/api-auth';
import { parseJsonBody } from '@/lib/http/parse-body';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { clampNotificationListLimit, toPublicNotification } from '@/lib/notification-public-dto';

// ─────────────────────────────────────────────────────────────
// GET /api/notifications - Get user notifications
// ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
    if ('error' in auth) return auth.error;
    const session = auth.session;

    const { searchParams } = new URL(request.url);
    const limit = clampNotificationListLimit(searchParams.get('limit'));
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          isRead: true,
          data: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: {
          userId: session.user.id,
          isRead: false,
        },
      }),
    ]);

    const notifications = rows.map(toPublicNotification);

    return NextResponse.json(
      {
        success: true,
        notifications,
        unreadCount,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching notifications:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Bildirimler getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/notifications - Mark notifications as read
// ─────────────────────────────────────────────────────────────
const PatchBodySchema = z.object({
  notificationId: z.string().trim().min(1, 'Geçersiz bildirim ID').max(64, 'Geçersiz bildirim ID').optional(),
  markAllRead: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
    if ('error' in auth) return auth.error;
    const session = auth.session;

    // mimari-api B6: gövde zod ile (bozuk JSON 500 değil 400; kimlik uzunluğu sınırlı).
    const parsed = await parseJsonBody(request, PatchBodySchema, { maxBytes: 4_096 });
    if (!parsed.ok) return parsed.response;
    const { notificationId, markAllRead } = parsed.data;

    if (markAllRead) {
      // Mark all notifications as read
      await prisma.notification.updateMany({
        where: {
          userId: session.user.id,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return NextResponse.json(
        { success: true, message: 'Tüm bildirimler okundu' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (notificationId) {
      const nid =
        typeof notificationId === 'string' && notificationId.length > 0 && notificationId.length <= 64
          ? notificationId
          : null;
      if (!nid) {
        return NextResponse.json(
          { error: 'Geçersiz bildirim ID' },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      const n = await prisma.notification.updateMany({
        where: {
          id: nid,
          userId: session.user.id,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      if (n.count === 0) {
        return NextResponse.json(
          { error: 'Bildirim bulunamadı' },
          { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }

      return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json(
      { error: 'Geçersiz istek' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error updating notifications:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Bildirimler güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/notifications - Delete notification
// ─────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
    if ('error' in auth) return auth.error;
    const session = auth.session;

    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('id');

    if (!notificationId || notificationId.length > 64) {
      return NextResponse.json(
        { error: 'Bildirim ID gerekli' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const del = await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId: session.user.id,
      },
    });
    if (del.count === 0) {
      return NextResponse.json(
        { error: 'Bildirim bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error deleting notification:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Bildirim silinemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}




