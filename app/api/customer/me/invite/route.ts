/**
 * Davet yüzeyi okuma modeli — `GET /api/customer/me/invite`.
 *
 * Sayfa ilk veriyi sunucuda (`app/customer/me/invite/page.tsx`) aynı `getInviteOverview` ile
 * alır; bu uç yalnız eylem sonrası tazeleme içindir. GET YAZMAZ (kod yoksa `code: null`;
 * kod `POST /api/customer/me/invite/code` ile üretilir).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getInviteOverview } from '@/lib/referral-invite';
import { assertInviteModule } from './gate';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.invite.overview', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user, request }) => {
    await assertInviteModule(user.id, request, 'customer.invite.overview');
    return ok(await getInviteOverview(user.id));
  }
);
