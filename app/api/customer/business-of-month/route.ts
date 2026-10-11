import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getBusinessOfMonth } from '@/lib/business-of-month';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/business-of-month — güncel "Ayın İşletmesi" rozetini döndürür.
 * Henüz belirlenmemişse winner:null.
 */
export async function GET() {
  const auth = await requireAuth(['CUSTOMER', 'DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const limited = await enforceRouteRateLimit('customer.business-of-month', auth.session.user.id, 'read');
  if (limited) return limited;

  const record = await getBusinessOfMonth();
  return NextResponse.json(
    { success: true, businessOfMonth: record },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
