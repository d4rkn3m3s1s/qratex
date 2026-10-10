/**
 * `GET /api/dealer/catalog/export` — ürünleri CSV olarak indir (Excel Türkçe: `;`, BOM, CRLF).
 * İçe aktarmanın tanıdığı sütunlarla aynı (gidiş-dönüş); `?archived=1` arşivi de katar.
 */
import { defineRoute } from '@/lib/http/define-route';
import { exportRows, istanbulYmd } from '@/lib/dealer/catalog/core';
import { toCsv } from '@/lib/dealer/catalog/csv';
import { priceToMinor } from '@/lib/dealer/catalog/money';
import { exportProducts } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.catalog.export',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ tenant, query }) => {
    const rows = await exportProducts(tenant.dealerId, query.get('archived') === '1');
    const csv = toCsv(
      exportRows(
        rows.map((r) => ({ name: r.name, categoryName: r.category.name, priceMinor: priceToMinor(r.price), description: r.description }))
      )
    );
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="urunler-${istanbulYmd(new Date())}.csv"`,
        'cache-control': 'private, no-store',
      },
    });
  }
);
