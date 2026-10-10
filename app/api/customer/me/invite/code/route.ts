/**
 * `POST /api/customer/me/invite/code` — davet kodunu hazırlar (yoksa üretir). İdempotent:
 * eşzamanlı iki çağrı aynı kodu döndürür (denetim #8: GET'te yazma + P2002 500'ü kapandı).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { ensureReferralCode } from '@/lib/referral-invite';
import { assertInviteModule } from '../gate';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'customer.invite.code', roles: ['CUSTOMER'], rateLimit: 'mutation' },
  async ({ user, request }) => {
    await assertInviteModule(user.id, request, 'customer.invite.code');
    const code = await ensureReferralCode(user.id);
    return ok({ code: code.code, codeActive: code.isActive });
  }
);
