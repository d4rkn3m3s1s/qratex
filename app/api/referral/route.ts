/**
 * Eski davet ucu — GERİYE UYUMLU İNCE SARMALAYICI.
 *
 * Asıl mantık `lib/referral-invite.ts` (davet yüzeyi, `/customer/me/invite`) ve
 * `lib/referral.ts`'te (P0-16 puan kuralları). Yeni istemciler `/api/customer/me/invite/*`
 * uçlarını kullanır. Bu uç yalnız şunlar için kalır:
 *  - `POST` — `/auth/complete` (OAuth sonrası `?ref=` kodu) `referral-outcome.ts` ile çağırır;
 *    yanıt alanları (`success`, `status`, `pointsEarned`, `error`) korunur.
 *  - `GET` / `PUT` — @deprecated; eski sayfa `/customer/referral` artık yönlendirme.
 *
 * Denetim (customer_referral.md) düzeltmeleri burada da geçerli: GET yazmaz (kod yoksa
 * `referralCode: null`), "kazanılan puan" gerçek toplam, kod uygulama kayıttan sonraki pencereyle
 * sınırlı, kademe ödemesi tek servis fonksiyonundan.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { assertInviteModule as gate } from '@/app/api/customer/me/invite/gate';
import {
  applyInviteCode,
  claimReferralMilestones,
  getInviteOverview,
  inviteRejectStatus,
} from '@/lib/referral-invite';

export const dynamic = 'force-dynamic';

/** @deprecated `GET /api/customer/me/invite` kullanın. */
export const GET = defineRoute(
  { name: 'referral.legacy.get', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user, request }) => {
    await gate(user.id, request, 'referral.legacy.get');
    const o = await getInviteOverview(user.id);
    return ok(
      {
        referralCode: o.code,
        referrals: o.referrals.rows,
        referredBy: o.referredBy,
        stats: {
          totalReferrals: o.counts.total,
          completedReferrals: o.counts.completed,
          pendingReferrals: o.counts.pending,
          totalPointsEarned: o.earnings.total,
        },
        milestones: o.milestones,
        rewards: o.rewards,
      },
      { legacySpread: true }
    );
  }
);

const ApplyBody = z.object({ code: z.string().trim().min(1).max(32) });

/**
 * Davet kodu uygula. Kod yalnız BEKLEYEN davet olarak kaydedilir; puan e-posta doğrulanıp ilk
 * QR olayı gerçekleşince verilir (koşullar zaten sağlanıyorsa hemen).
 */
export const POST = defineRoute(
  {
    name: 'referral.legacy.apply',
    roles: ['CUSTOMER'],
    schema: ApplyBody,
    rateLimit: { max: 10, windowMs: 10 * 60_000, by: 'user' },
  },
  async ({ user, request, body }) => {
    await gate(user.id, request, 'referral.legacy.apply');
    const result = await applyInviteCode(user.id, body.code);
    if (!result.ok) throw new ApiError(result.code, result.message, { status: inviteRejectStatus(result.code) });
    return ok(
      {
        status: result.status,
        pointsEarned: result.pointsEarned,
        message:
          result.status === 'COMPLETED'
            ? `Tebrikler! ${result.pointsEarned} puan kazandın.`
            : 'Davet kodun kaydedildi. E-postanı doğrulayıp ilk QR deneyimini tamamladığında ödülün hesabına işlenecek.',
      },
      { legacySpread: true }
    );
  }
);

/** @deprecated `POST /api/customer/me/invite/milestones/claim` kullanın. */
export const PUT = defineRoute(
  { name: 'referral.legacy.claim', roles: ['CUSTOMER'], rateLimit: 'mutation' },
  async ({ user, request }) => {
    await gate(user.id, request, 'referral.legacy.claim');
    const result = await claimReferralMilestones(user.id);
    if (result.awarded === 0) throw new ApiError('NOTHING_TO_CLAIM', 'Talep edilebilir kademe ödülü yok.', { status: 400 });
    return ok({ awarded: result.awarded, points: result.points }, { legacySpread: true });
  }
);
