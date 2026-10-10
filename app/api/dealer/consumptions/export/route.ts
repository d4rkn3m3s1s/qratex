import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { istanbulDayKey, parseLedgerFilters } from '@/lib/dealer/kasa/core';
import { exportLedgerCsv } from '@/lib/dealer/kasa/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/consumptions/export — defterin seçili filtreyle CSV dökümü (≤ 5000 satır,
 * `;` ayraçlı, UTF-8 BOM, formül enjeksiyonu nötr). Bayi ya da admin (`?dealerId=`).
 */
export const GET = defineRoute(
  {
    name: 'dealer.consumptions.export',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ request, tenant }) => {
    const csv = await exportLedgerCsv(tenant.dealerId, parseLedgerFilters(request.nextUrl.searchParams));
    return new Response(csv, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="islem-defteri-${istanbulDayKey(new Date())}.csv"`,
      },
    });
  }
);
