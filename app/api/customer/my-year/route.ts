/**
 * GET /api/customer/my-year?year=2026&month=3 — "Yılım" kişisel dönem özeti (BFF).
 *
 * Sayfa (`/customer/me/year`) özeti sunucuda ilk render'da hesaplar; bu uç yalnız istemci
 * yenilemesi/harici tüketici içindir. Hesap tek kaynaktan: `lib/customer-year/summary.server.ts`.
 *
 * Varsayılan reddet (defineRoute): yalnız CUSTOMER, `userId` oturumdan (IDOR yok), sorgu zod
 * ile doğrulanır, okuma hız sınırı. Dönem `resolvePeriod` ile üyelik/gelecek sınırına çekilir
 * (Europe/Istanbul). GET'te LLM ve yazma yok. Hata zarfı v2 (200 + sıfırlar YOK).
 */
import { defineRoute, ok, ApiError } from '@/lib/http/define-route';
import { YearQuerySchema } from '@/lib/customer-year/contract';
import { resolvePeriod } from '@/lib/customer-year/period';
import { getMemberSince, getYearSummary, YearUserNotFoundError } from '@/lib/customer-year/summary.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'customer.my-year.get',
    roles: ['CUSTOMER'],
    query: YearQuerySchema,
    rateLimit: 'read',
  },
  async ({ user, query }) => {
    const now = new Date();
    try {
      const memberSince = await getMemberSince(user.id);
      const { period, adjusted } = resolvePeriod({ year: query.year, month: query.month }, now, memberSince);
      const summary = await getYearSummary({ userId: user.id, period, adjusted, now });
      return ok(summary);
    } catch (err) {
      if (err instanceof YearUserNotFoundError) throw new ApiError('NOT_FOUND', 'Hesap bulunamadı.');
      throw err;
    }
  }
);
