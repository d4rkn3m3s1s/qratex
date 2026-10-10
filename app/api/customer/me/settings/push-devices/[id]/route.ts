import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/customer/me/settings/push-devices/:id — bir cihazın push aboneliğini kapatır.
 * Yalnız kendi aboneliği (kapsam `userId`); kayıt arşivlenir (`isActive=false`), silinmez.
 */
export const DELETE = defineRoute(
  {
    name: 'customer.me.settings.push-device.delete',
    roles: ['CUSTOMER'],
    params: z.object({ id: z.string().min(1).max(64) }),
    rateLimit: 'mutation',
  },
  async ({ user, params }) => {
    const res = await prisma.pushSubscription.updateMany({
      where: { id: params.id, userId: user.id, isActive: true },
      data: { isActive: false },
    });
    if (res.count === 0) throw new ApiError('NOT_FOUND', 'Cihaz bulunamadı ya da zaten kapalı.');
    return ok({ id: params.id });
  },
);
