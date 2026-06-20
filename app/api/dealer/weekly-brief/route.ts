import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/weekly-brief — haftalık AI digest geçmişi.
 * DealerWeeklyBrief kayıtları (haftalık cron üretir) artık okunabilir:
 * önceden yalnızca yazılıyordu (e-posta/bildirim), panelde görünmüyordu.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN', 'STAFF']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    let dealerId: string;
    if (session.user.role === 'STAFF') {
      const staffDealer = getStaffDealerId(session);
      if (staffDealer instanceof NextResponse) return staffDealer;
      dealerId = staffDealer;
    } else if (session.user.role === 'ADMIN') {
      const qp = new URL(request.url).searchParams.get('dealerId');
      if (!qp) {
        return NextResponse.json({ error: 'Admin için dealerId query gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      dealerId = qp;
    } else {
      dealerId = session.user.id;
    }

    const briefs = await prisma.dealerWeeklyBrief.findMany({
      where: { dealerId },
      orderBy: { weekStart: 'desc' },
      take: 12,
      select: { id: true, weekStart: true, topThemes: true, recommendedAction: true, createdAt: true },
    });

    return NextResponse.json({ briefs, count: briefs.length }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[WEEKLY_BRIEF_ERROR]', error);
    return NextResponse.json({ error: 'Haftalık özet alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
