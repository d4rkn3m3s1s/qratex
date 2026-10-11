/**
 * GET /api/admin/cards/export — filtre sonucu (en çok 10.000 kart) CSV: sıra, token, kart URL'si, parti…
 * `?batch=` ile matbaaya gidecek parti listesi (üretim sırasıyla). Token listesi hassastır:
 * her dışa aktarım denetime `CARDS_EXPORTED` olarak yazılır. Hücreler formül enjeksiyonuna karşı nötrlenir.
 */
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { csvLine } from '@/lib/admin-users/contract';
import { exportQuerySchema } from '@/lib/admin-cards/contract';
import { EXPORT_HEADER, exportCards, recordBatchExport, routeActor } from '@/lib/admin-cards/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.cards.export', roles: ['ADMIN'], query: exportQuerySchema, rateLimit: { max: 6, windowMs: 60_000, by: 'user' } },
  async ({ query, session, request, requestId }) => {
    const { sort, ...filters } = query;
    const { rows, count, truncated } = await exportCards(filters, sort);
    await recordBatchExport('CARDS_EXPORTED', filters.batch ?? null, count, filters, routeActor(session), getAuditRequestMeta(request));
    const lines = ['﻿' + csvLine(EXPORT_HEADER), ...rows.map((r) => csvLine(r))];
    const stamp = new Date().toISOString().slice(0, 10);
    const name = (filters.batch ? `kartlar-${filters.batch}` : `kartlar-${stamp}`).replace(/[^A-Za-z0-9_-]/g, '_');
    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}.csv"`,
        'x-request-id': requestId,
        'x-row-count': String(count),
        'x-truncated': truncated ? '1' : '0',
      },
    });
  }
);
