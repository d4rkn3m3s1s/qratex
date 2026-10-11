/**
 * GET  /api/admin/store/rewards — Ödül kataloğu (sunucu filtre/arama/sıralama/sayfalama).
 * POST /api/admin/store/rewards — Yeni ödül (zod, idempotent, varsayılan taslak, denetimli).
 * Admin yönetimi müşteri ucu /api/gamification/rewards'tan ayrıldı (rapor B11).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { rewardListQuerySchema, rewardUpsertSchema } from '@/lib/admin-store/contract';
import { createReward, listRewards } from '@/lib/admin-store/rewards.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.store.rewards.list', roles: ['ADMIN'], query: rewardListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listRewards(query))
);

export const POST = defineRoute(
  { name: 'admin.store.rewards.create', roles: ['ADMIN'], schema: rewardUpsertSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createReward(body, actorFromSession(session), request), { status: 201 })
);
