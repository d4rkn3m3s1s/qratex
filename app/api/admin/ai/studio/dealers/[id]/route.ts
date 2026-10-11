/**
 * GET   /api/admin/ai/studio/dealers/:id — politika, yapılandırılmış profil, yeniden eğitim önerisi, düzeltmeler, 7 gün kullanım.
 * PATCH /api/admin/ai/studio/dealers/:id — politika (yalnız tüketilen anahtarlar), baseVersion → 409, gerekçeli denetim.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { dealerPolicyPatchSchema } from '@/lib/ai-studio/contract';
import { getDealerDetail, updateDealerPolicy } from '@/lib/ai-studio/dealers.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export const GET = defineRoute(
  { name: 'admin.ai-studio.dealers.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params: p }) => ok(await getDealerDetail(p.id))
);

export const PATCH = defineRoute(
  { name: 'admin.ai-studio.dealers.update', roles: ['ADMIN'], params, schema: dealerPolicyPatchSchema, rateLimit: 'mutation' },
  async ({ params: p, body, session, request }) => ok(await updateDealerPolicy(p.id, body, actorFromSession(session), request))
);
