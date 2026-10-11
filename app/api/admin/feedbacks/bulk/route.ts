/**
 * POST /api/admin/feedbacks/bulk — toplu moderasyon: çöp kutusu / geri yükle / gizle /
 * yayınla / toksik işaretle / işaretleri temizle / bayiye hatırlat. Gerçek etkilenen sayı
 * ve atlananlar (gerekçeli) döner; denetim kaydı aynı transaction'da.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { bulkBodySchema } from '@/lib/admin-feedbacks/contract';
import { runBulk } from '@/lib/admin-feedbacks/actions.server';
import { actorFromSession } from '@/lib/data-safety/audit';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.feedbacks.bulk', roles: ['ADMIN'], schema: bulkBodySchema, rateLimit: 'mutation', maxBodyBytes: 32_000 },
  async ({ body, session, request }) => ok(await runBulk(body, { actor: actorFromSession(session), request }))
);
