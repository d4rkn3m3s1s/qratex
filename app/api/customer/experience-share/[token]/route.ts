import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { revokeExperienceShare } from '@/lib/experience-share/public';

export const dynamic = 'force-dynamic';

/**
 * Paylaşımı durdur — yalnız kartı oluşturan müşteri. Kayıt silinmez; süresi şimdiye çekilir
 * (arşiv ilkesi). Bağlantı açılınca "paylaşım sona erdi" ekranı görünür.
 */
export const DELETE = defineRoute(
  {
    name: 'customer.experience-share.revoke',
    roles: ['CUSTOMER'],
    params: z.object({ token: z.string().min(1).max(64) }),
    rateLimit: 'mutation',
    module: 'experiences',
  },
  async ({ params, user }) => {
    const revoked = await revokeExperienceShare(params.token, user.id);
    if (!revoked) throw new ApiError('NOT_FOUND', 'Aktif bir paylaşım bulunamadı.');
    return ok({ revoked: true });
  }
);
