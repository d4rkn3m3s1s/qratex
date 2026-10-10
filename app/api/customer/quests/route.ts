import { defineRoute, ok } from '@/lib/http/define-route';
import { getQuestBoard } from '@/lib/quests/board';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/quests — müşterinin görev panosu (BFF).
 *
 * Oturum ZORUNLU ve yalnız oturum sahibinin verisi döner (`?userId=` yok — Bulgu 4 / P0-09).
 * Yanıt açık DTO'dur (lib/quests/board-types.ts): görevler + dönem ilerlemesi + ödül durumu +
 * bekleyen ödül + yorum serisi + sezon challenge'ı + dönem sonları. GET hiçbir şey yazmaz.
 */
export const GET = defineRoute(
  {
    name: 'customer.quests.board',
    roles: ['CUSTOMER'],
    module: 'quests',
    rateLimit: 'read',
  },
  async ({ user }) => ok(await getQuestBoard(user.id))
);
