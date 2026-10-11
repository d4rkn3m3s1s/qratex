/**
 * GET /api/admin/audit/export — süzgece uyan kayıtların özet CSV'si (en çok 20.000; UTF-8 BOM, `;`,
 * formül kaçışı). Veri gövdesi içermez, IP maskeli; dışa aktarmanın kendisi denetime yazılır.
 */
import { defineRoute } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { actorFromSession } from '@/lib/data-safety/audit';
import { auditListQuerySchema } from '@/lib/admin-audit/contract';
import { exportAuditCsv, istanbulDay } from '@/lib/admin-audit/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.audit.export', roles: ['ADMIN'], query: auditListQuerySchema, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ query, session, request }) => {
    const { csv, rows, truncated } = await exportAuditCsv(prisma, query, actorFromSession(session), request);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="denetim-gunlugu-${istanbulDay(new Date())}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Export-Rows': String(rows),
        'X-Export-Truncated': truncated ? '1' : '0',
      },
    });
  }
);
