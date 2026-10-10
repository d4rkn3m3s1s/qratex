import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';
import {
  bumpCommunityVersion,
  DONATION_MAX_POINTS,
  DONATION_MESSAGE_MAX,
  getDonateOverview,
  makeDonation,
  notifyGoalReached,
} from '@/lib/customer-wallet/donate/service';

export const dynamic = 'force-dynamic';

const ROUTE_KEY = '/customer/wallet/donate';

/**
 * GET /api/customer/wallet/donate — bağış kataloğu (açık projeler) + kişisel etki + gerçek sıra.
 * Kişisel veriler katalog filtresinden bağımsızdır (kategori filtresi istemcide).
 */
export const GET = defineRoute(
  { name: 'customer.wallet.donate', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user, request }) => {
    await assertCustomerModule('donations', 'donations', { userId: user.id, request, routeKey: ROUTE_KEY });
    return ok(await getDonateOverview(prisma, user.id));
  },
);

const Body = z.object({
  projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  points: z.number().int().min(1).max(DONATION_MAX_POINTS),
  message: z.string().max(DONATION_MESSAGE_MAX).optional().nullable(),
  isPublic: z.boolean(),
  /** İstemcinin her bağış denemesi için ürettiği anahtar (çift gönderimde tek düşüm). */
  requestKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});

/**
 * POST /api/customer/wallet/donate — puan bağışı.
 * Puan yalnız `lib/economy` (debitPoints, source 'donation') üzerinden düşer; proje hedefi,
 * tarih penceresi ve aktiflik transaction içindeki koşullu güncellemeyle denetlenir.
 * Hata kodları: INSUFFICIENT_POINTS · GOAL_EXCEEDED · GOAL_REACHED · PROJECT_CLOSED · NOT_FOUND.
 */
export const POST = defineRoute(
  {
    name: 'customer.wallet.donate.create',
    roles: ['CUSTOMER'],
    schema: Body,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    maxBodyBytes: 8_000,
  },
  async ({ user, body, request }) => {
    await assertCustomerModule('donations', 'donations', { userId: user.id, request, routeKey: ROUTE_KEY });
    const result = await makeDonation(prisma, {
      userId: user.id,
      projectId: body.projectId,
      points: body.points,
      message: body.message ?? null,
      isPublic: body.isPublic,
      requestKey: body.requestKey,
    });
    if (!result.duplicate) {
      const followUp = async () => {
        await bumpCommunityVersion();
        if (result.goalReached) await notifyGoalReached(prisma, result.project.id, user.id);
      };
      try {
        after(() => followUp().catch((e) => console.error('[donate] sonrası iş başarısız', e)));
      } catch {
        // İstek bağlamı dışında (test) — doğrudan çalıştır.
        await followUp().catch((e) => console.error('[donate] sonrası iş başarısız', e));
      }
    }
    return ok(result, { status: result.duplicate ? 200 : 201 });
  },
);
