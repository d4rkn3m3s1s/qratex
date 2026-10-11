import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getClientIdentifier } from '@/lib/rate-limit';
import { getAuthFeatures } from '@/components/auth/p-auth/server-data';

export const dynamic = 'force-dynamic';

/**
 * Kimlik özellik bayrakları (hassas bilgi yok). Giriş/kayıt sayfaları artık bu bayrakları
 * SUNUCUDA okur (`getAuthFeatures`); uç, geriye uyumluluk ve harici istemciler için aynı tek
 * kaynaktan yanıt verir. `magicLink` yalnız e-posta gönderimi de yapılandırılmışsa true.
 */
export async function GET(request: Request) {
  const limited = await enforceRouteRateLimit('public.auth-features', getClientIdentifier(request), 'read');
  if (limited) return limited;
  const f = await getAuthFeatures();
  return NextResponse.json(
    { magicLink: f.magicLink, mailConfigured: f.mailConfigured, google: f.google, github: f.github },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
