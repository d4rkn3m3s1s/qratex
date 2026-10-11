/** GET /api/admin/trust/cases/export — filtreli vaka listesi CSV (UTF-8 BOM, en çok 5000 satır). */
import { defineRoute } from '@/lib/http/define-route';
import { CaseListQuery } from '@/lib/admin-trust/contract';
import { exportCasesCsv } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.trust.cases.export', roles: ['ADMIN'], query: CaseListQuery, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ query }) => {
    const csv = await exportCasesCsv(query);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="guven-vakalari-${day}.csv"`,
        'cache-control': 'private, no-store',
      },
    });
  }
);
