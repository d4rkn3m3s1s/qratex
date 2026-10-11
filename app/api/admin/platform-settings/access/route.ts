/**
 * /api/admin/platform-settings/access — rol bazlı özellik + menü görünürlüğü (sürüm kontrollü).
 * Global modül aç/kapa burada DEĞİL: tek kaynak /admin/features (B9).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { getAccessState, saveAccess } from '@/lib/platform-settings/server';

export const dynamic = 'force-dynamic';

const RoleMap = z.record(z.string().max(80), z.boolean());
const Body = z
  .object({
    featureVisibility: z.object({ dealer: RoleMap, customer: RoleMap }).strict(),
    menuVisibility: z.object({ dealer: RoleMap, customer: RoleMap }).strict(),
    clearSystemBlocks: z.boolean().optional(),
    baseVersions: z
      .object({ feature: z.string().min(1).max(200), menu: z.string().min(1).max(200), system: z.string().min(1).max(200).optional() })
      .strict(),
  })
  .strict();

export const GET = defineRoute(
  { name: 'admin.platformSettings.access.get', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok({ access: await getAccessState() })
);

export const PUT = defineRoute(
  { name: 'admin.platformSettings.access.save', roles: ['ADMIN'], schema: Body, rateLimit: 'mutation', maxBodyBytes: 100_000 },
  async ({ body, session, request }) => ok({ access: await saveAccess({ actor: actorFromSession(session), request }, body) })
);
