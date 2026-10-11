/**
 * `GET /api/location/reverse?lat=&lng=&lang=` — koordinattan okunur adres (Ayarlar › İşletme).
 *
 * Nominatim kullanım politikası (B12): saniyede ~1 istek ve önbellek bekler. Bu yüzden:
 *  - koordinat ~1 m'ye (5 ondalık) yuvarlanıp Redis'te 30 gün önbelleklenir,
 *  - kullanıcı başına dakikada 10 istek,
 *  - yanıt dili arayüz diline bağlıdır (`lang=tr|en`).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { redisGetJson, redisSetJson } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

type Resolved = { displayName: string; compactAddress: string };

const Query = z.object({
  lat: z.coerce.number().min(-90, 'Geçersiz koordinat').max(90, 'Geçersiz koordinat'),
  lng: z.coerce.number().min(-180, 'Geçersiz koordinat').max(180, 'Geçersiz koordinat'),
  lang: z.enum(['tr', 'en']).default('tr'),
});

export const GET = defineRoute(
  { name: 'location.reverse', roles: ['DEALER'], query: Query, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ query }) => {
    const lat = Number(query.lat.toFixed(5));
    const lng = Number(query.lng.toFixed(5));
    const cacheKey = `geo:rev:v1:${query.lang}:${lat}:${lng}`;
    const cached = await redisGetJson<Resolved>(cacheKey).catch(() => null);
    if (cached) return ok(cached);

    const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
    endpoint.searchParams.set('lat', String(lat));
    endpoint.searchParams.set('lon', String(lng));
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('addressdetails', '1');
    endpoint.searchParams.set('accept-language', query.lang);

    const appOrigin = getPublicAppOrigin();
    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        headers: {
          'User-Agent': `QRateX/1.0 (reverse geocode; +${appOrigin})`,
          Referer: `${appOrigin}/`,
          'Accept-Language': query.lang === 'en' ? 'en,tr;q=0.8' : 'tr,en;q=0.8',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Adres servisine ulaşılamadı. Biraz sonra tekrar deneyin.', { retryable: true });
    }
    if (response.status === 429) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Adres servisi şu an meşgul. Bir süre sonra tekrar deneyin.', { retryable: true });
    }
    if (!response.ok) throw new ApiError('SERVICE_UNAVAILABLE', 'Adres çözümlenemedi.', { status: 502, retryable: true });

    const data = (await response.json().catch(() => null)) as { display_name?: unknown; address?: Record<string, unknown> } | null;
    const displayName = typeof data?.display_name === 'string' ? data.display_name : '';
    const address = data?.address && typeof data.address === 'object' ? data.address : {};
    const compactAddress = [
      address.road,
      address.suburb || address.neighbourhood,
      address.city || address.town || address.state,
      address.country,
    ]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(', ');

    if (!displayName && !compactAddress) throw new ApiError('NOT_FOUND', 'Bu konum için adres bulunamadı.');
    const resolved: Resolved = { displayName, compactAddress: compactAddress || displayName };
    await redisSetJson(cacheKey, resolved, CACHE_TTL_SECONDS).catch(() => undefined);
    return ok(resolved);
  }
);
