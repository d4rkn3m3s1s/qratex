/**
 * GET /api/admin/squads/export — filtre sonucunun TAMAMI (en fazla 10.000 klan) BOM'lu CSV.
 * Hücreler formül enjeksiyonuna karşı nötrlenir; her dışa aktarım denetime yazılır.
 */
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { csvLine } from '@/lib/admin-users/contract';
import { SQUAD_EXPORT_MAX_ROWS, squadListQuerySchema } from '@/lib/admin-squads/contract';
import { SQUAD_EXPORT_HEADER, iterateSquadExport, squadExportRow } from '@/lib/admin-squads/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.squads.export', roles: ['ADMIN'], query: squadListQuerySchema, rateLimit: { max: 6, windowMs: 60_000, by: 'user' } },
  async ({ query, user, request, requestId }) => {
    const filters = { q: query.q, status: query.status, sort: query.sort };
    const lines: string[] = ['﻿' + csvLine(SQUAD_EXPORT_HEADER)];
    let count = 0;
    for await (const batch of iterateSquadExport(filters, SQUAD_EXPORT_MAX_ROWS)) {
      for (const s of batch) lines.push(csvLine(squadExportRow(s)));
      count += batch.length;
    }
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SQUADS_EXPORT',
        entity: 'Squad',
        entityId: `${count} klan`,
        newData: { q: filters.q ?? null, status: filters.status ?? null, sort: filters.sort ?? null, rows: count },
        ...getAuditRequestMeta(request),
      },
    });
    const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="klanlar-${stamp}.csv"`,
        'x-request-id': requestId,
        'x-row-count': String(count),
      },
    });
  }
);
