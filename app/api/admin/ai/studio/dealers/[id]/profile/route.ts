/** POST /api/admin/ai/studio/dealers/:id/profile — bayi öğrenme profilini yenile (veri eşiği, AI geçidi, denetim). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { refreshDealerProfile } from '@/lib/ai-studio/dealers.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export const POST = defineRoute(
  { name: 'admin.ai-studio.dealers.profile', roles: ['ADMIN'], params, rateLimit: 'ai' },
  async ({ params: p, session, request }) => ok(await refreshDealerProfile(p.id, actorFromSession(session), request))
);
