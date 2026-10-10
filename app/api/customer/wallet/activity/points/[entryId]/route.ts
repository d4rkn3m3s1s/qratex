import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getPointsEntry } from '@/lib/customer-wallet/activity/points-history';

export const dynamic = 'force-dynamic';

const Params = z.object({ entryId: z.string().regex(/^(l|e)_[A-Za-z0-9_-]{1,64}$/) });

/** GET /api/customer/wallet/activity/points/[entryId] — tek hareketin makbuzu (yalnız kendi kaydı). */
export const GET = defineRoute(
  { name: 'customer.wallet.activity.points.entry', roles: ['CUSTOMER'], params: Params, rateLimit: 'read' },
  async ({ user, params }) => {
    const entry = await getPointsEntry(prisma, user.id, params.entryId);
    if (!entry) throw new ApiError('NOT_FOUND', 'Hareket bulunamadı.');
    return ok({ entry });
  },
);
