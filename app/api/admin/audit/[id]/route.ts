/** GET /api/admin/audit/[id] — kayıt detayı: alan bazlı fark, maskeli gizli değerler, maskeli IP, geri alma uygunluğu. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getAuditDetail } from '@/lib/admin-audit/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.audit.detail', roles: ['ADMIN'], params: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }), rateLimit: 'read' },
  async ({ params }) => ok(await getAuditDetail(prisma, params.id))
);
