/**
 * `GET /api/customer/me/invite/referrals?cursor=&take=` — davet ettiklerim, imleç sayfalı.
 * Yalnız `referrerId = oturum`; adlar maskeli (`Ayşe K.`), fotoğraf yok.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { INVITE_PAGE_MAX, INVITE_PAGE_SIZE, listInviteRows } from '@/lib/referral-invite';
import { assertInviteModule } from '../gate';

export const dynamic = 'force-dynamic';

const Query = z.object({
  cursor: z.string().max(200).optional(),
  take: z.coerce.number().int().min(1).max(INVITE_PAGE_MAX).default(INVITE_PAGE_SIZE),
});

export const GET = defineRoute(
  { name: 'customer.invite.referrals', roles: ['CUSTOMER'], rateLimit: 'read', query: Query },
  async ({ user, request, query }) => {
    await assertInviteModule(user.id, request, 'customer.invite.referrals');
    return ok(await listInviteRows(user.id, { cursor: query.cursor ?? null, take: query.take }));
  }
);
