/**
 * `GET /api/dealer/today/weekly?week=YYYY-MM-DD` — Haftalık rapor (Bugün → Haftalık rapor).
 *
 * Hafta = İstanbul Pazartesi–Pazar; verilmezse son tamamlanan hafta. Sayılar kayıtlardan
 * deterministik; AI anlatısı yalnız önbellekten okunur (GET'te LLM yok).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { WeeklyRangeError, loadWeeklyReport } from '@/lib/dealer-today/weekly';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.today.weekly',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: z.object({
      week: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      dealerId: z.string().optional(),
    }),
  },
  async ({ tenant, query }) => {
    try {
      return ok(await loadWeeklyReport(tenant.dealerId, query.week ?? null));
    } catch (error) {
      if (error instanceof WeeklyRangeError) throw new ApiError('VALIDATION', error.message);
      throw error;
    }
  }
);
