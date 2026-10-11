/**
 * GET /api/admin/users/export — filtre sonucunun TAMAMI (en fazla 10.000 satır) CSV olarak.
 * Hücreler formül enjeksiyonuna karşı nötrlenir (OWASP), her dışa aktarım denetime yazılır.
 */
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { auditEntry } from '@/lib/data-safety/audit';
import { csvLine, listQuerySchema } from '@/lib/admin-users/contract';
import { EXPORT_HEADER, exportRow, iterateExport } from '@/lib/admin-users/list.server';
import { actionCtx } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.export', roles: ['ADMIN'], query: listQuerySchema, rateLimit: { max: 6, windowMs: 60_000, by: 'user' } },
  async ({ query, session, request, requestId }) => {
    const { page: _page, size: _size, sort, ...filters } = query;
    const lines: string[] = ['\uFEFF' + csvLine(EXPORT_HEADER)];
    let count = 0;
    for await (const batch of iterateExport(filters, sort)) {
      for (const u of batch) lines.push(csvLine(exportRow(u)));
      count += batch.length;
    }
    const ctx = actionCtx(session, request);
    await prisma.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'USERS_EXPORT', entity: 'User', entityId: `${count} kullanıcı`, newData: { filters, sort: sort ?? null, rows: count } },
        request
      ),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="kullanicilar-${stamp}.csv"`,
        'x-request-id': requestId,
        'x-row-count': String(count),
      },
    });
  }
);
