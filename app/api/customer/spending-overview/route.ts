import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

function monthRange(offsetFromCurrent: number, ref: Date) {
  const y = ref.getFullYear();
  const m = ref.getMonth() - offsetFromCurrent;
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  return { start, end, key };
}

export async function GET() {
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const customerId = auth.session.user.id;
    if (auth.session.user.role !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Yalnızca müşteri' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const now = new Date();

    const [agg, reviewAgg, byDealer] = await Promise.all([
      prisma.consumption.aggregate({
        where: { customerId },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.consumptionReview.aggregate({
        where: { customerId },
        _avg: { rating: true },
        _count: { id: true },
      }),
      prisma.consumption.groupBy({
        by: ['dealerId'],
        where: { customerId },
        _count: { id: true },
      }),
    ]);

    const uniqueDealers = byDealer.length;
    const topDealers = [...byDealer].sort((a, b) => b._count.id - a._count.id).slice(0, 8);

    const dealerIds = topDealers.map((t) => t.dealerId);
    const dealers =
      dealerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: dealerIds } },
            select: { id: true, businessName: true, name: true, businessLogo: true, image: true },
          })
        : [];
    const dealerMap = new Map(dealers.map((d) => [d.id, d]));

    const topDealersEnriched = topDealers.map((row) => {
      const d = dealerMap.get(row.dealerId);
      return {
        dealerId: row.dealerId,
        visits: row._count.id,
        label: d?.businessName || d?.name || row.dealerId,
        logo: d?.businessLogo || d?.image || null,
      };
    });

    // Aylık seri: önceden ay başına 1 sorgu (6 sorgu) → tek gruplanmış sorgu
    // (date_trunc('month')). monthRange yerel ay sınırı kullanıyor; aynı sonucu
    // korumak için DB'de de yerel aya göre grupla (to_char ile YYYY-MM anahtarı).
    const months = [5, 4, 3, 2, 1, 0].map((offset) => monthRange(offset, now));
    const monthStart = months[0].start;
    const monthEnd = months[months.length - 1].end;
    const monthRows = await prisma.$queryRaw<Array<{ key: string; n: bigint }>>(Prisma.sql`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS key, COUNT(*)::bigint AS n
      FROM "Consumption"
      WHERE "customerId" = ${customerId}
        AND "createdAt" >= ${monthStart} AND "createdAt" <= ${monthEnd}
      GROUP BY 1
    `);
    const monthCountByKey = new Map(monthRows.map((r) => [r.key, Number(r.n)]));
    const monthly = months.map(({ key }) => ({ key, label: key, count: monthCountByKey.get(key) ?? 0 }));

    const maxMonth = Math.max(1, ...monthly.map((m) => m.count));

    return NextResponse.json(
      {
        success: true,
        generatedAt: now.toISOString(),
        totals: {
          visits: agg._count.id,
          recordedSpend: agg._sum.amount ?? 0,
          uniqueDealers,
        },
        reviews: {
          count: reviewAgg._count.id,
          avgRating: reviewAgg._avg.rating != null ? Math.round(reviewAgg._avg.rating * 10) / 10 : null,
        },
        topDealers: topDealersEnriched,
        monthlyVisits: monthly.map((m) => ({ ...m, barPct: maxMonth ? Math.round((m.count / maxMonth) * 100) : 0 })),
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('spending-overview:', error);
    return NextResponse.json(
      { success: false, error: 'Özet yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
