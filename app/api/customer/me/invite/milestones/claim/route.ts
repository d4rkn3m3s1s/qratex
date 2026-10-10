/**
 * `POST /api/customer/me/invite/milestones/claim` — ulaşılmış davet kademesi ödüllerini talep eder.
 * Sunucu sayımı yeniden yapar; JSON guard + tek-kez anahtar ile çift ödeme imkânsız.
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { claimReferralMilestones } from '@/lib/referral-invite';
import { assertInviteModule } from '../../gate';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'customer.invite.milestones.claim', roles: ['CUSTOMER'], rateLimit: 'mutation' },
  async ({ user, request }) => {
    await assertInviteModule(user.id, request, 'customer.invite.milestones.claim');
    const result = await claimReferralMilestones(user.id);
    if (result.awarded === 0) {
      throw new ApiError('NOTHING_TO_CLAIM', 'Talep edilebilir kademe ödülü yok.', { status: 409 });
    }
    return ok(result);
  }
);
