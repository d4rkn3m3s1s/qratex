import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';
import { resolveSummaryPeriod, SUMMARY_RANGES } from '@/lib/customer-wallet/periods';
import { validAmount } from '@/lib/customer-wallet/activity/visits';
import { toCsv, type CsvCell } from '@/lib/customer-wallet/csv';
import { ISTANBUL_TZ } from '@/components/ds/page/date-range';

export const dynamic = 'force-dynamic';

const Query = z.object({
  range: z.enum(SUMMARY_RANGES).optional().default('month'),
  lang: z.enum(['tr', 'en']).optional().default('tr'),
});

const MAX_ROWS = 5000;

const HEADERS = {
  tr: ['Tarih', 'Saat', 'İşletme', 'Ürün', 'Kategori', 'Tutar (TL)', 'Yorum', 'Puan (1-5)'],
  en: ['Date', 'Time', 'Place', 'Product', 'Category', 'Amount (TRY)', 'Review', 'Rating (1-5)'],
} as const;

const REVIEW_LABEL = {
  tr: { pending: 'Bekliyor', reviewed: 'Yazıldı', removed: 'Kaldırıldı' },
  en: { pending: 'Pending', reviewed: 'Written', removed: 'Removed' },
} as const;

/**
 * GET /api/customer/wallet/activity/export?range=&lang= — dönemdeki ziyaretlerin CSV'si.
 * Sunucuda üretilir: formül enjeksiyonu kaçışlı (denetim B3), başlıklar kullanıcının dilinde,
 * tarih/saat Europe/Istanbul, TR'de `;` ayırıcı + ondalık virgül (Excel uyumu).
 */
export const GET = defineRoute(
  { name: 'customer.wallet.activity.export', roles: ['CUSTOMER'], query: Query, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ user, query, request, requestId }) => {
    await assertCustomerModule('spending_overview', null, { userId: user.id, request, routeKey: '/customer/wallet/activity' });
    const period = resolveSummaryPeriod(query.range);
    const rows = await prisma.consumption.findMany({
      where: { customerId: user.id, createdAt: period.from ? { gte: period.from, lt: period.to } : { lt: period.to } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS,
      select: {
        createdAt: true,
        amount: true,
        dealer: { select: { businessName: true, name: true } },
        product: { select: { name: true, category: { select: { name: true } } } },
        review: { select: { rating: true, deletedAt: true } },
      },
    });
    const tag = query.lang === 'en' ? 'en-GB' : 'tr-TR';
    const dateFmt = new Intl.DateTimeFormat(tag, { timeZone: ISTANBUL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFmt = new Intl.DateTimeFormat(tag, { timeZone: ISTANBUL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const labels = REVIEW_LABEL[query.lang];
    const unnamed = query.lang === 'en' ? 'Unnamed place' : 'İsimsiz işletme';

    const table: CsvCell[][] = [[...HEADERS[query.lang]]];
    for (const r of rows) {
      const state = !r.review ? 'pending' : r.review.deletedAt ? 'removed' : 'reviewed';
      table.push([
        dateFmt.format(r.createdAt),
        timeFmt.format(r.createdAt),
        r.dealer?.businessName?.trim() || r.dealer?.name?.trim() || unnamed,
        r.product?.name ?? '',
        r.product?.category?.name ?? '',
        validAmount(r.amount),
        labels[state],
        state === 'reviewed' ? r.review?.rating ?? null : null,
      ]);
    }
    const csv = toCsv(table, query.lang);
    const filename = `qratex-ziyaretler-${query.range}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  },
);
