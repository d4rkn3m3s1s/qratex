/** POST /api/admin/donations/:id/actions — aç/kapat, öne çıkar, arşivle/geri al, gerçek toplamla uzlaştır (gerekçeli, denetimli). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { actorFromSession } from '@/lib/data-safety/audit';
import { projectActionSchema } from '@/lib/admin-donations/contract';
import { projectAction } from '@/lib/admin-donations/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.donations.action',
    roles: ['ADMIN'],
    params: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }),
    schema: projectActionSchema,
    rateLimit: 'mutation',
  },
  async ({ params, body, session, request }) => ok(await projectAction(prisma, params.id, body, actorFromSession(session), request))
);
