/** GET /api/admin/donations/transactions/:id — bağış makbuzu (makbuz no + puan defteri satırı + etki). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getTransaction } from '@/lib/admin-donations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.donations.transaction', roles: ['ADMIN'], params: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }), rateLimit: 'read' },
  async ({ params }) => ok(await getTransaction(prisma, params.id))
);
