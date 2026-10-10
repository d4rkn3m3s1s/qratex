/**
 * GET /api/dealer/inbox/summary — Gelen Kutusu KPI'ları (sayıyı kod hesaplar):
 * bekleyen + SLA aşan (tüm zamanlar), dönem ortalama puanı, yanıt oranı, medyan ilk yanıt
 * süresi, olumsuz oranı (tek tanım) ve önceki eşit döneme göre değişim, puan dağılımı.
 *
 *   ?from=<ISO>&to=<ISO>  (yarı açık [from, to), en fazla 366 gün; verilmezse son 30 İstanbul günü)
 *
 * Redis'te 60 sn; yanıt/kapama/atama sürümü değiştirir (bayat KPI görünmez).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { defaultInboxPeriod, getInboxSummary } from '@/lib/dealer-inbox/server';

export const dynamic = 'force-dynamic';

const MAX_SPAN_MS = 366 * 86_400_000;

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  dealerId: z.string().max(191).optional(),
});

export const GET = defineRoute(
  {
    name: 'dealer.inbox.summary',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: querySchema,
  },
  async ({ query, tenant }) => {
    let period = defaultInboxPeriod();
    if (query.from || query.to) {
      if (!query.from || !query.to) throw new ApiError('VALIDATION', 'Dönem için başlangıç ve bitiş birlikte verilmeli.');
      const from = new Date(query.from);
      const to = new Date(query.to);
      if (!(to.getTime() > from.getTime()) || to.getTime() - from.getTime() > MAX_SPAN_MS) {
        throw new ApiError('VALIDATION', 'Dönem geçersiz (en fazla 366 gün).');
      }
      period = { from, to };
    }
    return ok(await getInboxSummary(tenant.dealerId, period));
  }
);
