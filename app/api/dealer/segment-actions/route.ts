import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { buildSegmentSummaries, type CustomerRow } from '@/lib/segment-action-center';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/segment-actions
 * SEGMENT AKSİYON MERKEZİ: bu bayinin müşterilerini segment bazında özetler ve her
 * segment için önerilen tek-tık aksiyonu (+ uygulayacağı endpoint) döndürür. CLV
 * verisini (clv-core cron) aksiyon-odaklı bir panele bağlar. Yeni tablo gerektirmez.
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

    // Bu bayiyle tüketimi olan müşteri id'leri.
    const customerRows = await prisma.consumption.groupBy({
      by: ['customerId'],
      where: { dealerId },
      _count: { _all: true },
    });
    const customerIds = customerRows.map((r) => r.customerId);
    if (customerIds.length === 0) {
      return NextResponse.json(
        { segments: [], totalCustomers: 0, note: 'Henüz müşteri verisi yok' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const clvRows = await prisma.customerLifetimeValue.findMany({
      where: { userId: { in: customerIds } },
      select: {
        totalSpent: true,
        predictedChurn: true,
        segment: { select: { name: true } },
      },
    });

    const customers: CustomerRow[] = clvRows.map((c) => ({
      totalSpent: c.totalSpent,
      predictedChurn: c.predictedChurn,
      segmentName: c.segment?.name ?? null,
    }));

    const segments = buildSegmentSummaries(customers);
    const totalCustomers = customers.length;
    const clvMissing = clvRows.length === 0;

    return NextResponse.json(
      {
        segments,
        totalCustomers,
        note: clvMissing ? 'CLV henüz hesaplanmadı (günlük cron 02:00). Segmentler yakında dolacak.' : undefined,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[DEALER_SEGMENT_ACTIONS_ERROR]', error);
    return NextResponse.json({ error: 'Segment özeti alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
