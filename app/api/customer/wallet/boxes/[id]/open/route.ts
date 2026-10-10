/**
 * POST /api/customer/wallet/boxes/[id]/open — sürpriz kutuyu aç.
 *
 * Sahiplik `where` içinde (IDOR yok); `openedAt` atomik geçiş; puan `mintPoints` ile tek-kez
 * (`surprise:<kutuId>`) + defter + `points_credited`. İçerik (puan, kupon, mesaj) yalnız bu
 * yanıtta döner; daha önce açılmışsa `alreadyOpened: true` (istemci kutlama yapmaz).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { openBox } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.wallet.boxes.open',
    roles: ['CUSTOMER'],
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    params: z.object({ id: z.string().min(1).max(64) }),
  },
  async ({ params, user, request }) => {
    await assertCustomerModule('surprise_boxes', null, { userId: user.id, request, routeKey: 'customer.wallet.boxes.open' });
    try {
      return ok(await openBox({ userId: user.id, boxId: params.id }));
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);
