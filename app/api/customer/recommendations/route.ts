import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getRecommendations, buildRecommendationHeadline } from '@/lib/recommendations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/recommendations — "Sen Seversin" ürün önerileri.
 * Co-occurrence tabanlı (ürün → kategori → dealer fallback). Yeterli veri yoksa
 * boş liste + hasData:false döner.
 * `?explain=1` → hibrit LLM başlık cümlesi de üretir (opsiyonel, maliyet nedeniyle varsayılan kapalı).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;

  const recommendations = await getRecommendations(auth.session.user.id);
  const explain = req.nextUrl.searchParams.get('explain') === '1';
  const headline = explain ? await buildRecommendationHeadline(recommendations) : null;

  return NextResponse.json(
    {
      success: true,
      hasData: recommendations.length > 0,
      recommendations,
      headline,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
