/**
 * GET /api/admin/dealers-health/export — geçerli filtre/sıralama ile TÜM satırlar CSV (sayfasız).
 * Dışa aktarma denetim izine yazılır (bayi e-postaları içerir).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { ExportQuery } from '@/components/admin/a-bayi-sagligi/server/schemas';
import { loadAllRows, selectRows } from '@/components/admin/a-bayi-sagligi/server/list';
import { rowsToCsv } from '@/components/admin/a-bayi-sagligi/domain';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.dealers-health.export',
    roles: ['ADMIN'],
    query: ExportQuery,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ query, user, request }) => {
    const { rows } = await loadAllRows(query.window);
    const selected = selectRows(rows, {
      q: query.q || null,
      band: query.band ?? null,
      flag: query.flag ?? null,
      sort: query.sort ?? null,
    });
    const meta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actorType: 'user',
        actorSnapshot: { role: user.role } as Prisma.InputJsonValue,
        action: 'dealer_health.export',
        entity: 'DealerHealth',
        newData: {
          window: query.window,
          band: query.band ?? null,
          flag: query.flag ?? null,
          q: query.q ?? null,
          rows: selected.length,
        } as Prisma.InputJsonValue,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    return new Response(rowsToCsv(selected, query.window), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="bayi-sagligi-${day}.csv"`,
      },
    });
  }
);
