import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { buildSegmentSummaries, type CustomerRow } from '@/lib/segment-action-center';
import { resolveDealerScope, scopeErrorResponse } from '@/lib/auth/scope';
import { listDealerSegmentRows } from '@/lib/dealer-customer-stats';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/segment-actions
 * SEGMENT AKSİYON MERKEZİ: bu işletmenin müşterilerini segment bazında özetler ve her segment
 * için önerilen tek-tık aksiyonu (+ uygulayacağı endpoint) döndürür.
 *
 * P0-12: Segment, harcama ve kayıp riski YALNIZ BU İŞLETMENİN verisinden (`DealerCustomerStats`
 * ya da canlı bayi kapsamlı hesap). Eski uç platform geneli CLV'yi okuyordu → bir müşterinin rakip
 * işletmelerdeki harcaması bu bayinin "VIP" segmentine yansıyordu. Kapsam `resolveDealerScope`
 * (STAFF yalnız AKTİF bağlı olduğu işletme; ADMIN `?dealerId=` ile).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN', 'STAFF']);
    if ('error' in auth) return auth.error;

    const scope = await resolveDealerScope(auth.session, {
      dealerId: new URL(request.url).searchParams.get('dealerId'),
    });
    if (!scope.ok) return scopeErrorResponse(scope);

    const { rows, source } = await listDealerSegmentRows(scope.dealerId);
    if (rows.length === 0) {
      return NextResponse.json(
        { segments: [], totalCustomers: 0, note: 'Henüz müşteri verisi yok' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const customers: CustomerRow[] = rows;
    const segments = buildSegmentSummaries(customers);

    return NextResponse.json(
      {
        segments,
        totalCustomers: customers.length,
        source,
        note: source === 'live' ? 'Segmentler günlük olarak yenilenir; şu an anlık hesaplanan değerler gösteriliyor.' : undefined,
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
