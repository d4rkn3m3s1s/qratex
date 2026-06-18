import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/customers
 * Bu bayiyle tüketimi olan müşterilerin CLV özetini (toplam harcama, ziyaret,
 * churn riski, segment) döndürür. CustomerLifetimeValue (cron ile hesaplanan)
 * verisini gerçek bir okuma yüzeyine bağlar. ?sort=spend|churn, ?limit=.
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
        return NextResponse.json(
          { error: 'Admin için dealerId query gerekli' },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      dealerId = qp;
    } else {
      dealerId = session.user.id;
    }

    const sp = new URL(request.url).searchParams;
    const sort = sp.get('sort') === 'churn' ? 'churn' : 'spend';
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 200);

    // Bu bayiyle tüketimi olan benzersiz müşteri id'leri.
    const customerRows = await prisma.consumption.groupBy({
      by: ['customerId'],
      where: { dealerId },
      _count: { _all: true },
    });
    const customerIds = customerRows.map((r) => r.customerId);
    if (customerIds.length === 0) {
      return NextResponse.json({ customers: [], count: 0 }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const clvRows = await prisma.customerLifetimeValue.findMany({
      where: { userId: { in: customerIds } },
      select: {
        userId: true,
        totalSpent: true,
        totalVisits: true,
        avgOrderValue: true,
        lastPurchaseAt: true,
        predictedChurn: true,
        churnRisk: true,
        calculatedAt: true,
        user: { select: { name: true, email: true, image: true } },
        segment: { select: { name: true, color: true } },
      },
      orderBy: sort === 'churn' ? { predictedChurn: 'desc' } : { totalSpent: 'desc' },
      take: limit,
    });

    const customers = clvRows.map((c) => ({
      // Ham müşteri ID'si bayiye sızdırılmaz (gizlilik). Liste anahtarı için
      // kararlı ama geri döndürülemez kısa bir referans üretilir.
      ref: `c_${c.userId.slice(-8)}`,
      name: c.user.name,
      email: c.user.email,
      image: c.user.image,
      totalSpent: c.totalSpent,
      totalVisits: c.totalVisits,
      avgOrderValue: Number(c.avgOrderValue.toFixed(2)),
      lastPurchaseAt: c.lastPurchaseAt,
      predictedChurn: c.predictedChurn,
      churnRisk: c.churnRisk,
      segment: c.segment ? { name: c.segment.name, color: c.segment.color } : null,
      calculatedAt: c.calculatedAt,
    }));

    return NextResponse.json(
      { customers, count: customers.length, note: clvRows.length === 0 ? 'CLV henüz hesaplanmadı (günlük cron)' : undefined },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[DEALER_CUSTOMERS_ERROR]', error);
    return NextResponse.json({ error: 'Müşteriler alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
