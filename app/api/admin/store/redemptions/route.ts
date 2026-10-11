/** GET /api/admin/store/redemptions — Talepler (UserReward) teslim zinciri: durum/tür/ödül/arama + sayfalama. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { redemptionListQuerySchema } from '@/lib/admin-store/contract';
import { listRedemptions } from '@/lib/admin-store/redemptions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.store.redemptions.list', roles: ['ADMIN'], query: redemptionListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listRedemptions(query))
);
