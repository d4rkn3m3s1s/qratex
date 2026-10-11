/**
 * `DELETE /api/dealer/settings/push-devices/:id` — kayıtlı bir cihazın anlık bildirim
 * aboneliğini kapatır (yalnız kendi cihazları; başkasının kimliği 404).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute(
  {
    name: 'dealer.settings.push-device.remove',
    roles: ['DEALER'],
    params: z.object({ id: z.string().min(1).max(64) }),
    rateLimit: 'mutation',
  },
  async ({ user, params }) => {
    const res = await prisma.pushSubscription.updateMany({
      where: { id: params.id, userId: user.id, isActive: true },
      data: { isActive: false },
    });
    if (res.count === 0) throw new ApiError('NOT_FOUND', 'Cihaz bulunamadı.');
    return ok({ id: params.id });
  }
);
