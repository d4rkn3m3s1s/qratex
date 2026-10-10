import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getPublicExperience } from '@/lib/experience-share/public';

export const dynamic = 'force-dynamic';

/**
 * Anonim deneyim kartı — SALT OKUMA (yan etkisiz). Sayfa (`/experience/[token]`) aynı okuma
 * modelini sunucuda kullanır; görüntülenme sayımı ayrı `POST …/view` ucundadır (denetim B5).
 * Paylaşanın kimliği ve ham sayaç dönmez.
 */
export const GET = defineRoute(
  {
    name: 'public.experience-share.read',
    roles: 'public',
    params: z.object({ token: z.string().min(1).max(64) }),
    rateLimit: 'read',
  },
  async ({ params }) => {
    const result = await getPublicExperience(params.token);
    switch (result.status) {
      case 'ok': {
        const { viewCount: _viewCount, ...card } = result.card;
        return ok({ status: 'ok', card });
      }
      case 'expired':
        throw new ApiError('SHARE_EXPIRED', 'Bu kartın paylaşım süresi sona erdi.', {
          status: 410,
          details: { venue: result.venue },
        });
      case 'disabled':
        throw new ApiError('MODULE_DISABLED');
      case 'not_found':
        throw new ApiError('NOT_FOUND', 'Kart bulunamadı.');
      default:
        throw new ApiError('SERVICE_UNAVAILABLE', undefined, { retryable: true, headers: { 'Retry-After': '8' } });
    }
  }
);
