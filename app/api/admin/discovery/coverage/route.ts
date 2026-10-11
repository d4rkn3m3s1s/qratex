/** GET /api/admin/discovery/coverage — bayi profili + yedek konum kapsaması (özet + sayfalı satırlar). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { coverageQuerySchema } from '@/lib/admin-discovery/contract';
import { getCoverage } from '@/lib/admin-discovery/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.discovery.coverage', roles: ['ADMIN'], query: coverageQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getCoverage(prisma, query))
);
