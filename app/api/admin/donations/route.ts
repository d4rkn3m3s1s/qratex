/**
 * GET  /api/admin/donations — bağış kampanyaları (sunucu filtre/arama/sıralama/sayfalama, gerçek toplamlarla).
 * POST /api/admin/donations — yeni kampanya (paylaşılan zod sözleşmesi, idempotent, denetimli).
 * Eski GET/PATCH/PUT (doğrulamasız, denetimsiz, sahte "Soft Freeze") kaldırıldı; tek tüketicisi bu paneldi.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { actorFromSession } from '@/lib/data-safety/audit';
import { projectListQuerySchema, projectUpsertSchema } from '@/lib/admin-donations/contract';
import { createProject, listProjects } from '@/lib/admin-donations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.donations.list', roles: ['ADMIN'], query: projectListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listProjects(prisma, query))
);

export const POST = defineRoute(
  { name: 'admin.donations.create', roles: ['ADMIN'], schema: projectUpsertSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createProject(prisma, body, actorFromSession(session), request), { status: 201 })
);
