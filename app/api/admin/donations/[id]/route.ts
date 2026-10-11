/**
 * GET   /api/admin/donations/:id — kampanya ayrıntısı (gerçek toplam, 30 gün serisi, en çok bağışlayanlar, son bağışlar, geçmiş).
 * PATCH /api/admin/donations/:id — tam form + `baseUpdatedAt` iyimser kilidi (409), denetimli.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { actorFromSession } from '@/lib/data-safety/audit';
import { projectPatchSchema } from '@/lib/admin-donations/contract';
import { getProjectDetail, updateProject } from '@/lib/admin-donations/server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export const GET = defineRoute(
  { name: 'admin.donations.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params: p }) => ok(await getProjectDetail(prisma, p.id))
);

export const PATCH = defineRoute(
  { name: 'admin.donations.update', roles: ['ADMIN'], params, schema: projectPatchSchema, rateLimit: 'mutation' },
  async ({ params: p, body, session, request }) => ok(await updateProject(prisma, p.id, body, actorFromSession(session), request))
);
