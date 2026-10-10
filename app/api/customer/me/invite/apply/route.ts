/**
 * `POST /api/customer/me/invite/apply` { code } — kayıttan sonraki pencerede davet kodu uygular.
 * Davet `PENDING` kaydedilir; puan yalnız e-posta doğrulanıp ilk QR olayı gerçekleşince
 * `qualifyReferral` ile tek seferlik verilir (koşullar zaten sağlıysa hemen).
 * Hata kodları makine-okunur (`code`), istemci kendi dilinde gösterir.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { applyInviteCode, inviteRejectStatus } from '@/lib/referral-invite';
import { assertInviteModule } from '../gate';

export const dynamic = 'force-dynamic';

const Body = z.object({ code: z.string().trim().min(1).max(32) });

export const POST = defineRoute(
  {
    name: 'customer.invite.apply',
    roles: ['CUSTOMER'],
    schema: Body,
    // Kod tahminine karşı sıkı: 10 deneme / 10 dk.
    rateLimit: { max: 10, windowMs: 10 * 60_000, by: 'user' },
  },
  async ({ user, request, body }) => {
    await assertInviteModule(user.id, request, 'customer.invite.apply');
    const result = await applyInviteCode(user.id, body.code);
    if (!result.ok) {
      throw new ApiError(result.code, result.message, { status: inviteRejectStatus(result.code) });
    }
    return ok({ status: result.status, pointsEarned: result.pointsEarned, expiresAt: result.expiresAt });
  }
);
