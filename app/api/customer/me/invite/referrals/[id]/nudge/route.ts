/**
 * `POST /api/customer/me/invite/referrals/:id/nudge` — bekleyen arkadaşa hatırlatma.
 * Kapsam: yalnız kendi davetin. Aynı arkadaşa 72 saatte bir; ilk QR olayı zaten varsa
 * hatırlatma yerine nitelendirme yeniden denenir.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { nudgeInvite } from '@/lib/referral-invite';
import { assertInviteModule } from '../../../gate';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

const REJECT: Record<string, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: 'Davet bulunamadı.' },
  NOT_PENDING: { status: 409, message: 'Bu davet artık beklemede değil.' },
  NOT_VERIFIED: { status: 409, message: 'Arkadaşın önce e-posta adresini doğrulamalı.' },
  RECENTLY_NUDGED: { status: 429, message: 'Bu arkadaşına kısa süre önce hatırlatma gönderildi.' },
  NOT_QUALIFIED: { status: 409, message: 'Davet henüz tamamlanma koşullarını sağlamıyor.' },
};

export const POST = defineRoute(
  {
    name: 'customer.invite.nudge',
    roles: ['CUSTOMER'],
    params: Params,
    rateLimit: { max: 20, windowMs: 60 * 60_000, by: 'user' },
  },
  async ({ user, request, params }) => {
    await assertInviteModule(user.id, request, 'customer.invite.nudge');
    const result = await nudgeInvite(user.id, params.id);
    if (result.kind === 'rejected') {
      const meta = REJECT[result.reason] ?? { status: 409, message: 'Hatırlatma gönderilemedi.' };
      throw new ApiError(result.reason, meta.message, {
        status: meta.status,
        details: result.nextAt ? { nextAt: result.nextAt } : undefined,
      });
    }
    return ok(result);
  }
);
