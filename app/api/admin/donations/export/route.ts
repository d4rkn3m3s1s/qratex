/** GET /api/admin/donations/export — filtreye uyan TÜM bağışlar (en çok 20.000) CSV; UTF-8 BOM, `;` ayraç, formül kaçışı. */
import { defineRoute } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { transactionQuerySchema } from '@/lib/admin-donations/contract';
import { exportTransactionsCsv, istanbulDay } from '@/lib/admin-donations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.donations.export', roles: ['ADMIN'], query: transactionQuerySchema, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ query }) => {
    const { csv, rows, truncated } = await exportTransactionsCsv(prisma, query);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bagislar-${istanbulDay(new Date())}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Export-Rows': String(rows),
        'X-Export-Truncated': truncated ? '1' : '0',
      },
    });
  }
);
