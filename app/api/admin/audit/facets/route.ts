/** GET /api/admin/audit/facets — son 90 günün gerçek varlık/eylem/aktör değerleri ve sayıları (5 dk önbellek). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getFacets } from '@/lib/admin-audit/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.audit.facets', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getFacets(prisma)));
