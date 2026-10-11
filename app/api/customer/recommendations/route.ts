import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { checkRateLimitDb } from '@/lib/rate-limit';
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
  const limited = await enforceRouteRateLimit('customer.recommendations', auth.session.user.id, 'read');
  if (limited) return limited;

  const recommendations = await getRecommendations(auth.session.user.id);
  const explain = req.nextUrl.searchParams.get('explain') === '1';
  // LLM başlığı her sayfa açılışında istenir (istemci hep `explain=1` gönderir): maliyet tavanı
  // kullanıcı başına saatte 10 üretim. Tavan dolunca ya da sayaç okunamazsa başlık YOK (null) —
  // öneriler yine döner; uydurma/yer tutucu başlık gösterilmez.
  let headline: string | null = null;
  if (explain && recommendations.length > 0) {
    const aiBudget = await checkRateLimitDb(`reco-headline:${auth.session.user.id}`, 10, 60 * 60_000).catch(() => null);
    if (aiBudget?.ok) headline = await buildRecommendationHeadline(recommendations);
  }

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
