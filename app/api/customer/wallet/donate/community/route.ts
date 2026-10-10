import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';
import { getDonationCommunity } from '@/lib/customer-wallet/donate/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/wallet/donate/community — bağışçı sıralaması (ilk 10, maskeli ad, `isMe`),
 * son herkese açık bağışlar ve kullanıcının gerçek sırası (ilk 10 dışında da).
 * Paylaşılan kısım 60 sn önbellekte; her bağış önbelleği sürümler.
 */
export const GET = defineRoute(
  { name: 'customer.wallet.donate.community', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user, request }) => {
    await assertCustomerModule('donations', 'donations', { userId: user.id, request, routeKey: '/customer/wallet/donate' });
    return ok(await getDonationCommunity(prisma, user.id));
  },
);
