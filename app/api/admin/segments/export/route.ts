/**
 * GET /api/admin/segments/export?segment=&q=&sort= — segment üyeleri CSV (en fazla 10.000 satır,
 * formül enjeksiyonu korumalı). Kişisel veri içerdiği için denetim izine yazılır; dakikada 5.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { exportSegmentMembersCsv } from '@/components/admin/a-segmentler/server/segments';
import { ExportQuery } from '@/components/admin/a-segmentler/server/schemas';
import { CSV_HEADER } from '@/components/admin/a-segmentler/copy';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.segments.export', roles: ['ADMIN'], query: ExportQuery, rateLimit: { max: 5, windowMs: 60_000, by: 'user' } },
  async ({ query, user, request }) => {
    const res = await exportSegmentMembersCsv({ segmentId: query.segment, q: query.q, sort: query.sort }, CSV_HEADER);
    const meta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actorType: 'user',
        actorSnapshot: { role: user.role } as Prisma.InputJsonValue,
        action: 'segment.export',
        entity: 'CustomerSegment',
        entityId: query.segment,
        newData: { q: query.q || null, rows: res.rows, truncated: res.truncated } as Prisma.InputJsonValue,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const slug = query.segment.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    return new Response(res.csv, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="segment-${slug}-${day}.csv"`,
        'x-export-truncated': res.truncated ? '1' : '0',
      },
    });
  }
);
