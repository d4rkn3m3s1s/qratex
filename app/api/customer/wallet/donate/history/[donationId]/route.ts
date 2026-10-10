import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getDonationReceipt } from '@/lib/customer-wallet/donate/service';

export const dynamic = 'force-dynamic';

const Params = z.object({ donationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

/** GET /api/customer/wallet/donate/history/[donationId] — tek bağış makbuzu (yalnız kendi bağışı). */
export const GET = defineRoute(
  { name: 'customer.wallet.donate.receipt', roles: ['CUSTOMER'], params: Params, rateLimit: 'read' },
  async ({ user, params }) => {
    const receipt = await getDonationReceipt(prisma, user.id, params.donationId);
    if (!receipt) throw new ApiError('NOT_FOUND', 'Makbuz bulunamadı.');
    return ok({ receipt });
  },
);
