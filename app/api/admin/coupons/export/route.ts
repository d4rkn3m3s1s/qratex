/** GET /api/admin/coupons/export — geçerli filtreyle CSV (Excel uyumlu BOM + `;`, formül enjeksiyonu korumalı). */
import { defineRoute } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { couponListQuerySchema } from '@/lib/admin-coupons/contract';
import { exportCouponsCsv } from '@/lib/admin-coupons/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.coupons.export', roles: ['ADMIN'], query: couponListQuerySchema, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ query }) => {
    const csv = await exportCouponsCsv(query);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="kuponlar-${stamp}.csv"`,
      },
    });
  }
);
