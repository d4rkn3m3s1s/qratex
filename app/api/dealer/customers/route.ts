import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { resolveDealerScope, scopeErrorResponse } from '@/lib/auth/scope';
import { maskEmail } from '@/lib/http/dto';
import {
  DEALER_SEGMENT_COLOR,
  DEALER_SEGMENT_NAME,
  churnBucketOf,
  countDealerCustomers,
  getDealerCustomerStats,
  type DealerStatsSort,
} from '@/lib/dealer-customer-stats';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

/** Müşteri için bayiye özgü, geri çevrilemez liste referansı (ham id sızmaz). */
function customerRef(dealerId: string, customerId: string): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'qratex-customer-ref';
  return 'c_' + createHmac('sha256', secret).update(`${dealerId}:${customerId}`).digest('hex').slice(0, 16);
}

/**
 * GET /api/dealer/customers
 * Bu işletmenin müşterileri — harcama, ziyaret, son ziyaret, kayıp riski ve segment YALNIZ BU
 * İŞLETMENİN verisinden (P0-12). ?sort=spend|churn|recent, ?limit=.
 *
 * Eski uç platform geneli `CustomerLifetimeValue`'yu döndürüyordu: bayi müşterinin RAKİP
 * işletmelerdeki harcamasını, son alışverişini, global segmentini ve platform güven skorunu
 * görüyordu (STAFF dahil). Artık:
 *  - Kaynak `DealerCustomerStats` (kiracı kapsamlı; cron) → yoksa canlı bayi kapsamlı hesap.
 *  - Güven skoru (platform geneli dolandırıcılık sinyali) dönmez; yalnız kaba "güvenilir" rozeti.
 *  - Kapsam `resolveDealerScope`: STAFF yalnız AKTİF bağlı olduğu işletme; e-posta personele maskeli.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN', 'STAFF']);
    if ('error' in auth) return auth.error;

    const sp = new URL(request.url).searchParams;
    const scope = await resolveDealerScope(auth.session, { dealerId: sp.get('dealerId') });
    if (!scope.ok) return scopeErrorResponse(scope);
    const dealerId = scope.dealerId;

    const sortParam = sp.get('sort');
    const sort: DealerStatsSort = sortParam === 'churn' ? 'churn' : sortParam === 'recent' ? 'recent' : 'spend';
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 200);

    const [{ stats, source, calculatedAt }, total] = await Promise.all([
      getDealerCustomerStats(dealerId, { sort, limit }),
      countDealerCustomers(dealerId),
    ]);
    if (stats.length === 0) {
      return NextResponse.json({ customers: [], count: 0, total: 0 }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: stats.map((s) => s.customerId) } },
      select: { id: true, name: true, email: true, image: true, trustTier: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const revealEmail = scope.actorRole !== 'STAFF';

    const customers = stats.map((s) => {
      const u = userById.get(s.customerId);
      return {
        ref: customerRef(dealerId, s.customerId),
        name: u?.name ?? null,
        email: u?.email ? (revealEmail ? u.email : maskEmail(u.email)) : null,
        image: u?.image ?? null,
        totalSpent: s.totalSpend,
        totalVisits: s.visitCount,
        avgOrderValue: Number(s.avgOrderValue.toFixed(2)),
        lastPurchaseAt: s.lastVisitAt,
        predictedChurn: s.churnRisk,
        churnRisk: churnBucketOf(s.churnRisk),
        reviewCount: s.reviewCount,
        avgRating: s.avgRating,
        segment: s.segmentKey
          ? { name: DEALER_SEGMENT_NAME[s.segmentKey], color: DEALER_SEGMENT_COLOR[s.segmentKey] }
          : null,
        // Platform güven skoru bayiye verilmez; yalnız "güvenilir" kaba rozeti.
        trustScore: null,
        trustTier: u?.trustTier === 'trusted' ? 'trusted' : null,
        calculatedAt: calculatedAt,
      };
    });

    return NextResponse.json(
      {
        customers,
        count: customers.length,
        total,
        source,
        note: source === 'live' ? 'Özet günlük olarak yenilenir; şu an anlık hesaplanan değerler gösteriliyor.' : undefined,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[DEALER_CUSTOMERS_ERROR]', error);
    return NextResponse.json({ error: 'Müşteriler alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
