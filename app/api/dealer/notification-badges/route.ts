import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/** GET: Unread (no dealer reply), negative, and toxic feedback counts for dealer sidebar badge */
export async function GET() {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const dealerId = session.user.id;

    const [unreadCount, negativeCount, toxicCount] = await Promise.all([
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          dealerReply: null,
        },
      }),
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          sentiment: 'negative',
        },
      }),
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          isToxic: true,
        },
      }),
    ]);

    const badgeCount = unreadCount + (toxicCount > 0 ? toxicCount : 0); // show unread + toxic as badge
    return NextResponse.json(
      {
        unreadCount,
        negativeCount,
        toxicCount,
        badgeCount: Math.min(badgeCount, 99),
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (e) {
    console.error('Dealer notification-badges error:', e);
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    return NextResponse.json(
      { unreadCount: 0, negativeCount: 0, toxicCount: 0, badgeCount: 0 },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
