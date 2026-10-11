/**
 * GET   /api/admin/ai-ops/dealers — bayi bazlı AI durumu (ana anahtar, otomatik analiz, kullanım, kota, bekleyen).
 * PATCH /api/admin/ai-ops/dealers — bayinin AI ana anahtarı / otomatik analizi (gerekçeli, denetimli).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { actorFromSession } from '@/lib/data-safety/audit';
import { dealerAiPatchSchema, dealersQuerySchema } from '@/lib/admin-ai-ops/contract';
import { getDealersPage, setDealerAi } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai_ops.dealers', roles: ['ADMIN'], query: dealersQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getDealersPage(prisma, query))
);

export const PATCH = defineRoute(
  { name: 'admin.ai_ops.dealers.update', roles: ['ADMIN'], schema: dealerAiPatchSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await setDealerAi(prisma, body, actorFromSession(session), request))
);
