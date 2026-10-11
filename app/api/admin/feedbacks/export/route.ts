/**
 * GET /api/admin/feedbacks/export — aktif görünüm + filtrelerin TAMAMI (en fazla 10.000
 * satır) CSV. Hücreler formül enjeksiyonuna karşı nötrlenir; her dışa aktarım denetime yazılır.
 */
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { csvLine, feedQuerySchema } from '@/lib/admin-feedbacks/contract';
import { EXPORT_HEADER, exportFeed, exportRow } from '@/lib/admin-feedbacks/feed.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.feedbacks.export', roles: ['ADMIN'], query: feedQuerySchema, rateLimit: { max: 6, windowMs: 60_000, by: 'user' } },
  async ({ query, session, request, requestId }) => {
    const { page: _page, size: _size, ...filters } = query;
    const items = await exportFeed(filters);
    const lines = ['﻿' + csvLine(EXPORT_HEADER), ...items.map((i) => csvLine(exportRow(i)))];
    await prisma.auditLog.create({
      data: auditEntry(
        actorFromSession(session),
        { action: 'FEEDBACKS_EXPORT', entity: 'Feedback', entityId: `${items.length} kayıt`, newData: { filters, rows: items.length } },
        request
      ),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="geri-bildirimler-${stamp}.csv"`,
        'x-request-id': requestId,
      },
    });
  }
);
